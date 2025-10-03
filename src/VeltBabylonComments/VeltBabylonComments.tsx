// VeltBabylonComments
// Renders Velt comment pins on top of a Babylon scene using DOM overlays and portals.
// This component is scene-agnostic: it reads Babylon refs and uses the
// useVeltBabylonComments hook to (a) attach pointer capture for addContext and
// (b) reconstruct existing annotation pins to render.
import type { AbstractMesh, ArcRotateCamera, Engine, Scene } from '@babylonjs/core'
import { Matrix, Vector3, Viewport } from '@babylonjs/core'
import { VeltCommentPin } from '@veltdev/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVeltBabylonComments } from './useVeltBabylonComments'
import { useVeltCreateCommentAnchors } from './useVeltCreateCommentAnchors'

type MarkerRecord = {
    id: number
    mesh: AbstractMesh | null
    localPosition: Vector3
    worldStatic: Vector3 | null
    annotationId: string
    mountEl?: HTMLDivElement
}

export default function VeltBabylonComments(props: {
    sceneId: string,
    engineRef: React.MutableRefObject<Engine | null>,
    sceneRef: React.MutableRefObject<Scene | null>,
    cameraRef: React.MutableRefObject<ArcRotateCamera | null>,
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
    isPlayingRef?: React.MutableRefObject<boolean>,
    ready: boolean,
    resolveMesh?: (scene: Scene, local: { meshId: string; meshUniqueId: number; meshName: string } | undefined) => AbstractMesh | null,
}) {
    const { sceneId, engineRef, sceneRef, cameraRef, canvasRef, isPlayingRef, ready, resolveMesh } = props

    // Hook: provides annotation-derived pins and wires Velt addContext
    const { computedPins } = useVeltBabylonComments({
        sceneId,
        sceneRef,
        resolveMesh,
    })

    useVeltCreateCommentAnchors({
        sceneId,
        engineRef,
        sceneRef,
        cameraRef,
        canvasRef,
        isPlayingRef,
        ready,
    })

    // Managed markers
    const markersRef = useRef<MarkerRecord[]>([])
    const [markers, setMarkers] = useState<MarkerRecord[]>([])

    // Rebuild markers whenever annotations change
    useEffect(() => {
        const scene = sceneRef.current;
        const wrapper = canvasRef.current?.parentElement as HTMLDivElement | null;
        if (!scene || !wrapper) return;

        // Clear existing markers if none to show
        if (!computedPins || computedPins.length === 0) {
            for (const markerRef of markersRef.current) {
                if (markerRef.mountEl && markerRef.mountEl.parentNode) {
                    markerRef.mountEl.parentNode.removeChild(markerRef.mountEl);
                }
            }
            markersRef.current = []
            setMarkers([])
            return
        }

        const newMarkers: MarkerRecord[] = []
        for (const pin of computedPins) {
            const record: MarkerRecord = {
                id: Date.now() + Math.random(),
                mesh: pin.mesh,
                localPosition: pin.localPosition,
                worldStatic: pin.worldStatic,
                annotationId: pin.annotationId,
                mountEl: undefined,
            }

            const mount = document.createElement('div')
            mount.style.position = 'absolute'
            mount.style.pointerEvents = 'auto'
            mount.style.zIndex = '12'
            wrapper.appendChild(mount)
            record.mountEl = mount

            newMarkers.push(record)
        }

        // Replace markers
        for (const m of markersRef.current) {
            if (m.mountEl && m.mountEl.parentNode) m.mountEl.parentNode.removeChild(m.mountEl)
        }
        markersRef.current = newMarkers
        setMarkers(newMarkers)
    }, [computedPins, sceneRef, canvasRef])

    // Per-frame projection using scene.onBeforeRenderObservable
    useEffect(() => {
        const scene = sceneRef.current
        const camera = cameraRef.current
        const engine = engineRef.current
        const canvas = canvasRef.current
        if (!scene || !camera || !engine || !canvas) {
            console.log('VeltBabylonComments:projection observer not attached (missing deps)', {
                hasScene: !!scene,
                hasCamera: !!camera,
                hasEngine: !!engine,
                hasCanvas: !!canvas,
            })
            return
        }

        console.log('VeltBabylonComments:attaching projection observer')

        const observer = scene.onBeforeRenderObservable.add(() => {
            const renderW = engine.getRenderWidth()
            const renderH = engine.getRenderHeight()
            const viewport: Viewport = camera.viewport.toGlobal(renderW, renderH)
            const rect = canvas.getBoundingClientRect()
            const scaleX = rect.width / renderW
            const scaleY = rect.height / renderH
            for (const markerRef of markersRef.current) {
                // If mesh is missing (e.g., different scene), use worldStatic fallback
                const worldPos = markerRef.mesh
                    ? Vector3.TransformCoordinates(markerRef.localPosition, markerRef.mesh.getWorldMatrix())
                    : (markerRef.worldStatic as Vector3)
                if (!worldPos) {
                    continue
                }
                const projected = Vector3.Project(
                    worldPos,
                    Matrix.Identity(),
                    scene.getTransformMatrix(),
                    viewport
                )
                const isVisible = projected.z >= 0 && projected.z <= 1
                const left = projected.x * scaleX
                const top = projected.y * scaleY
                if (!isVisible) {
                    if (markerRef.mountEl) markerRef.mountEl.style.display = 'none'
                } else {
                    if (markerRef.mountEl) {
                        markerRef.mountEl.style.display = 'block'
                        markerRef.mountEl.style.left = `${left}px`
                        markerRef.mountEl.style.top = `${top}px`
                        markerRef.mountEl.style.transform = 'translate(-50%, -50%)'
                    }
                }
            }
        })

        return () => {
            if (scene && observer) scene.onBeforeRenderObservable.remove(observer)
        }
    }, [sceneRef, cameraRef, engineRef, canvasRef, ready])

    // Clean up markers on unmount
    useEffect(() => {
        return () => {
            for (const m of markersRef.current) {
                if (m.mountEl && m.mountEl.parentNode) m.mountEl.parentNode.removeChild(m.mountEl)
            }
            markersRef.current = []
        }
    }, [])

    return (
        <>
            {/* Render Velt pins via portals to preserve Provider context */}
            {markers.map((m) => (m.mountEl ? createPortal(
                <VeltCommentPin key={m.id} annotationId={m.annotationId} />,
                m.mountEl
            ) : null))}
        </>
    )
}