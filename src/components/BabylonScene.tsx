import { useEffect, useRef } from 'react'
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  Color4,
} from 'babylonjs'

export default function BabylonScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<Engine | null>(null)
  const sceneRef = useRef<Scene | null>(null)

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

    new HemisphericLight('light', new Vector3(0, 1, 0), scene)

    const box = MeshBuilder.CreateBox('box', { size: 1 }, scene)

    engine.runRenderLoop(() => {
      box.rotation.y += 0.01
      scene.render()
    })

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

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />
    </div>
  )
}


