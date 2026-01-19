// VeltBabylonComments
// Renders Velt comment pins on top of a Babylon scene using DOM overlays.
// This component is scene-agnostic: it reads Babylon refs and uses the
// useVeltBabylonComments hook to (a) attach pointer capture for addContext and
// (b) reconstruct existing annotation pins to render.
import type { AbstractMesh, ArcRotateCamera, Engine, Scene } from '@babylonjs/core'
import { Matrix, Vector3, Viewport } from '@babylonjs/core'
import { VeltCommentPin } from '@veltdev/react'
import { memo, useEffect, useRef, useState } from 'react'
import { useVeltBabylonComments } from './useVeltBabylonComments'
import { useVeltCreateCommentAnchors } from './useVeltCreateCommentAnchors'

type MarkerData = {
    mesh: AbstractMesh | null
    localPosition: Vector3
    worldStatic: Vector3 | null
}

// Memoized pin - only re-renders if annotationId changes
const Pin = memo(function Pin({ annotationId }: { annotationId: string }) {
    return (
        <div
            data-pin-id={annotationId}
            style={{
                position: 'absolute',
                pointerEvents: 'auto',
                zIndex: 12,
                display: 'none',
            }}
        >
            <VeltCommentPin annotationId={annotationId} />
        </div>
    )
})

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

    // Container ref for querying pin elements
    const containerRef = useRef<HTMLDivElement>(null)
    // Marker data for projection (single source of truth)
    const markerDataRef = useRef<Map<string, MarkerData>>(new Map())
    // Annotation IDs for React rendering
    const [annotationIds, setAnnotationIds] = useState<string[]>([])

    // Sync marker data and IDs when computedPins change
    useEffect(() => {
        if (!computedPins || computedPins.length === 0) {
            markerDataRef.current.clear()
            setAnnotationIds([])
            return
        }

        // Update marker data ref (no re-render needed)
        const newData = new Map<string, MarkerData>()
        const newIds: string[] = []
        for (const pin of computedPins) {
            newData.set(pin.annotationId, {
                mesh: pin.mesh,
                localPosition: pin.localPosition,
                worldStatic: pin.worldStatic,
            })
            newIds.push(pin.annotationId)
        }
        markerDataRef.current = newData

        // Only update state if IDs actually changed
        setAnnotationIds(prev => {
            const newSet = new Set(newIds)
            if (prev.length === newIds.length && prev.every(id => newSet.has(id))) {
                return prev
            }
            return newIds
        })
    }, [computedPins])

    // Per-frame projection
    useEffect(() => {
        const scene = sceneRef.current
        const camera = cameraRef.current
        const engine = engineRef.current
        const canvas = canvasRef.current
        const container = containerRef.current
        if (!scene || !camera || !engine || !canvas || !container) return

        const observer = scene.onBeforeRenderObservable.add(() => {
            const renderW = engine.getRenderWidth()
            const renderH = engine.getRenderHeight()
            const viewport: Viewport = camera.viewport.toGlobal(renderW, renderH)
            const rect = canvas.getBoundingClientRect()
            const scaleX = rect.width / renderW
            const scaleY = rect.height / renderH

            for (const [id, data] of markerDataRef.current) {
                const el = container.querySelector<HTMLDivElement>(`[data-pin-id="${id}"]`)
                if (!el) continue

                const worldPos = data.mesh
                    ? Vector3.TransformCoordinates(data.localPosition, data.mesh.getWorldMatrix())
                    : data.worldStatic
                if (!worldPos) {
                    el.style.display = 'none'
                    continue
                }

                const projected = Vector3.Project(
                    worldPos,
                    Matrix.Identity(),
                    scene.getTransformMatrix(),
                    viewport
                )

                if (projected.z < 0 || projected.z > 1) {
                    el.style.display = 'none'
                } else {
                    el.style.display = 'block'
                    el.style.left = `${projected.x * scaleX}px`
                    el.style.top = `${projected.y * scaleY}px`
                    el.style.transform = 'translate(-50%, -50%)'
                }
            }
        })

        return () => { scene.onBeforeRenderObservable.remove(observer) }
    }, [sceneRef, cameraRef, engineRef, canvasRef, ready])

    return (
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {annotationIds.map(id => <Pin key={id} annotationId={id} />)}
        </div>
    )
}