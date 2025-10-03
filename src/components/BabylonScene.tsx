import type { Mesh } from '@babylonjs/core'
import {
    ArcRotateCamera,
    Color4,
    Engine,
    HemisphericLight,
    MeshBuilder,
    Scene,
    Vector3,
} from '@babylonjs/core'
import { useEffect, useRef, useState } from 'react'
import { VeltBabylonComments } from '../VeltBabylonComments'

export default function BabylonScene() {
    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const engineRef = useRef<Engine | null>(null)
    const sceneRef = useRef<Scene | null>(null)
    const cameraRef = useRef<ArcRotateCamera | null>(null)
    const boxRef = useRef<Mesh | null>(null)
    const renderLoopRef = useRef<(() => void) | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const isPlayingRef = useRef(false)

    // Hook for Velt integration (captures clicks and rebuilds pins from annotations)
    const [ready, setReady] = useState(false)

    // One-time Babylon scene creation and render loop
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
        engineRef.current = engine

        const scene = new Scene(engine)
        sceneRef.current = scene
        scene.clearColor = new Color4(0.02, 0.02, 0.04, 1)

        const camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2.5, 4, new Vector3(0, 0, 0), scene)
        camera.attachControl(canvas, true)
        camera.lowerRadiusLimit = 1
        camera.upperRadiusLimit = 20
        cameraRef.current = camera

        new HemisphericLight('light', new Vector3(0, 1, 0), scene)

        const faceColors = [
            new Color4(1, 1, 1, 1),
            new Color4(1, 1, 0, 1),
            new Color4(1, 0, 0, 1),
            new Color4(1, 0.5, 0, 1),
            new Color4(0, 0, 1, 1),
            new Color4(0, 1, 0, 1),
        ]
        const box = MeshBuilder.CreateBox('box', { size: 1, faceColors }, scene)
        boxRef.current = box
        setReady(true)

        renderLoopRef.current = () => {
            // Always render the scene to keep overlays updating; gate rotation only
            if (boxRef.current) {
                if (isPlayingRef.current) {
                    boxRef.current.rotation.y += 0.01
                }
            }
            scene.render()
        }
        if (renderLoopRef.current) {
            engine.runRenderLoop(renderLoopRef.current)
        }

        const onResize = () => {
            engine.resize()
        }
        window.addEventListener('resize', onResize)

        return () => {
            window.removeEventListener('resize', onResize)
            engine.stopRenderLoop()
            scene.dispose()
            engine.dispose()
        }
    }, [])

    useEffect(() => {
        isPlayingRef.current = isPlaying
    }, [isPlaying])

    return (
        <>
            <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none', display: 'block' }} />
                {/* [VELT] Import VeltBabylonComments to add comments on canvas */}
                <VeltBabylonComments
                    sceneId={'babylon-cube-scene'}
                    engineRef={engineRef}
                    sceneRef={sceneRef}
                    cameraRef={cameraRef}
                    canvasRef={canvasRef}
                    isPlayingRef={isPlayingRef}
                    ready={ready}
                />
                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        display: 'flex',
                        gap: 8,
                        background: 'rgba(0,0,0,0.55)',
                        padding: '8px 10px',
                        borderRadius: 8,
                        alignItems: 'center',
                        zIndex: 10,
                        color: '#fff',
                        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
                        pointerEvents: 'auto',
                    }}
                >
                    <button
                        onClick={() => setIsPlaying((p) => !p)}
                        style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.2)',
                            background: isPlaying ? '#2ea043' : '#1f6feb',
                            color: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        {isPlaying ? 'Pause' : 'Play'}
                    </button>
                </div>
            </div>
        </>
    )
}