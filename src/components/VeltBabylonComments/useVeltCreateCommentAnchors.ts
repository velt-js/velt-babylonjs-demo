// Hook that bridges Babylon.js pointer/picking with Velt comments.
// Responsibilities:
// - Capture pointer clicks inside a Babylon scene and compute a stable 3D anchor
// - Immediately forward that anchor to Velt's add comment handler via addContext
// - Reconstruct pins from existing Velt annotations so any scene can render them
import type { AbstractMesh, ArcRotateCamera, Engine, Scene } from '@babylonjs/core';
import { Matrix, PointerEventTypes, Vector3, Viewport } from '@babylonjs/core';
import { useCommentAddHandler, useCommentModeState } from '@veltdev/react';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Stable, serializable data needed to re-anchor a comment pin in 3D.
 * - world: absolute position
 * - local: optional local position + mesh identity (so it sticks to moving meshes)
 * - screen: CSS pixel projection (useful for DOM overlays)
 * - camera: view state at capture time (optionally useful for restore behaviors)
 */
export type BabylonCommentAnchor = {
    isOnMesh: boolean;
    world: { x: number; y: number; z: number };
    local?: { x: number; y: number; z: number; meshId: string; meshUniqueId: number; meshName: string };
    screen: { x: number; y: number };
    camera: {
        alpha: number;
        beta: number;
        radius: number;
        target: { x: number; y: number; z: number };
        position: { x: number; y: number; z: number };
    };
    timestamp: number;
}

/**
 * Encapsulates all Babylon ⇄ Velt wiring so scenes remain focused on rendering.
 *
 * Params
 * - engineRef/sceneRef/cameraRef/canvasRef: Babylon objects owned by the scene
 * - isPlayingRef: scene render state (we avoid capturing anchors while animating)
 * - ready: true when the scene/camera have been created (observer is attached then)
 */
export function useVeltCreateCommentAnchors(params: {
    sceneId: string,
    engineRef: React.MutableRefObject<Engine | null>
    sceneRef: React.MutableRefObject<Scene | null>
    cameraRef: React.MutableRefObject<ArcRotateCamera | null>
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
    isPlayingRef?: React.MutableRefObject<boolean>
    ready: boolean
}) {
    const { sceneId, engineRef, sceneRef, cameraRef, canvasRef, isPlayingRef, ready } = params

    const commentModeState = useCommentModeState();
    const commentModeStateRef = useRef<boolean>(false);
    // Mirror Velt comment mode to a ref for zero-cost checks in event handlers
    useEffect(() => {
        commentModeStateRef.current = !!commentModeState;
        console.log('useVeltBabylonComments:commentMode changed', { commentMode: !!commentModeState })
    }, [commentModeState])

    const clickedAnchorRef = useRef<BabylonCommentAnchor | null>(null);
    const addHandler = useCommentAddHandler();

    // If the Velt addHandler becomes available AFTER a click, push the latest anchor
    useEffect(() => {
        console.log('useVeltBabylonComments:addHandler changed', addHandler, clickedAnchorRef.current);
        if (addHandler && sceneId && clickedAnchorRef.current) {
            try {
                const babylonAnchorData = {
                    ...clickedAnchorRef.current,
                    sceneId,
                };
                addHandler.addContext({ babylonAnchorData, commentType: 'manual' });
            } catch (err) {
                console.error('useVeltBabylonComments:addContext on handler change error', err)
            }
        }
    }, [addHandler, sceneId])

    // Build anchor data from a world point/mesh (explains "why": stable re-anchoring)
    const buildAnchor = useCallback((world: Vector3, mesh: AbstractMesh | null) => {
        const scene = sceneRef.current
        const engine = engineRef.current
        const camera = cameraRef.current
        const canvas = canvasRef.current
        if (!scene || !engine || !camera || !canvas) return null

        const invLocal = (() => {
            if (mesh) {
                const invWorld = mesh.getWorldMatrix().clone()
                invWorld.invert()
                return Vector3.TransformCoordinates(world as Vector3, invWorld)
            }
            return null
        })()

        const renderW = engine.getRenderWidth()
        const renderH = engine.getRenderHeight()
        const viewport: Viewport = camera.viewport.toGlobal(renderW, renderH)
        const rect = canvas.getBoundingClientRect()
        const scaleX = rect.width / renderW
        const scaleY = rect.height / renderH
        const projected = Vector3.Project(world, Matrix.Identity(), scene.getTransformMatrix(), viewport)
        const screenX = projected.x * scaleX
        const screenY = projected.y * scaleY

        const anchor: BabylonCommentAnchor = {
            isOnMesh: !!mesh,
            world: { x: world.x, y: world.y, z: world.z },
            local: invLocal && mesh
                ? {
                    x: invLocal.x,
                    y: invLocal.y,
                    z: invLocal.z,
                    meshId: mesh.id,
                    meshUniqueId: mesh.uniqueId,
                    meshName: mesh.name,
                }
                : undefined,
            screen: { x: screenX, y: screenY },
            camera: {
                alpha: camera.alpha,
                beta: camera.beta,
                radius: camera.radius,
                target: { x: camera.target.x, y: camera.target.y, z: camera.target.z },
                position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            },
            timestamp: Date.now(),
        }
        return anchor
    }, [sceneRef, engineRef, cameraRef, canvasRef])

    // Attach Babylon pointer observer (when ready) so our anchor capture runs
    // before global DOM click handlers. This avoids races with Velt's flows.
    useEffect(() => {
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!ready) {
            console.log('useVeltBabylonComments:observer not attached (not ready)');
            return;
        }
        if (!scene || !camera) {
            console.log('useVeltBabylonComments:observer not attached (scene/camera missing)');
            return;
        }
        console.log('useVeltBabylonComments:attaching pointer observer');
        const observer = scene.onPointerObservable.add((info) => {
            if (info.type !== PointerEventTypes.POINTERDOWN) return;
            if (isPlayingRef?.current) return;
            if (!commentModeStateRef.current) return;
            console.log('useVeltBabylonComments:pointerDown');
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const evt = info.event as PointerEvent;
            const px = evt.clientX - rect.left;
            const py = evt.clientY - rect.top;
            const pick = scene.pick(px, py);
            let world: Vector3 | null = null;
            let mesh: AbstractMesh | null = null;
            if (pick && pick.hit && pick.pickedPoint) {
                world = pick.pickedPoint.clone();
                mesh = pick.pickedMesh ?? null;
            } else {
                const ray = scene.createPickingRay(px, py, Matrix.Identity(), camera)
                const normal = new Vector3(0, 1, 0);
                const denom = Vector3.Dot(normal, ray.direction);
                if (Math.abs(denom) > 1e-6) {
                    const t = Vector3.Dot(normal, ray.origin.scale(-1)) / denom;
                    world = t >= 0 ? ray.origin.add(ray.direction.scale(t)) : null;
                } else {
                    world = null;
                }
                mesh = null;
            }
            if (!world) return;
            const clickedAnchor = buildAnchor(world, mesh);
            if (!clickedAnchor) return;
            clickedAnchorRef.current = clickedAnchor;
            console.log('useVeltBabylonComments:anchor captured', clickedAnchor);
        }, PointerEventTypes.POINTERDOWN, true)
        return () => {
            if (scene && observer) {
                scene.onPointerObservable.remove(observer);
            }
        }
    }, [commentModeStateRef, isPlayingRef, sceneRef, cameraRef, buildAnchor, ready, canvasRef]);

    return {
        commentMode: !!commentModeState,
        clickedAnchorRef,
    }
}