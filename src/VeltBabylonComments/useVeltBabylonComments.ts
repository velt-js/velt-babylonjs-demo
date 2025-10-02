// Hook that bridges Babylon.js pointer/picking with Velt comments.
// Responsibilities:
// - Capture pointer clicks inside a Babylon scene and compute a stable 3D anchor
// - Immediately forward that anchor to Velt's add comment handler via addContext
// - Reconstruct pins from existing Velt annotations so any scene can render them
import type { AbstractMesh, ArcRotateCamera, Engine, Scene } from '@babylonjs/core'
import { Matrix, PointerEventTypes, Vector3, Viewport } from '@babylonjs/core'
import { useCommentAddHandler, useCommentAnnotations, useCommentModeState } from '@veltdev/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'

/**
 * Stable, serializable data needed to re-anchor a comment pin in 3D.
 * - world: absolute position
 * - local: optional local position + mesh identity (so it sticks to moving meshes)
 * - screen: CSS pixel projection (useful for DOM overlays)
 * - camera: view state at capture time (optionally useful for restore behaviors)
 */
export type BabylonCommentAnchor = {
	isOnMesh: boolean
	world: { x: number; y: number; z: number }
	local?: { x: number; y: number; z: number; meshId: string; meshUniqueId: number; meshName: string }
	screen: { x: number; y: number }
	camera: {
		alpha: number
		beta: number
		radius: number
		target: { x: number; y: number; z: number }
		position: { x: number; y: number; z: number }
	}
	timestamp: number
}

/**
 * Minimal structure the UI can consume to render a pin for a Velt annotation.
 * Values are real Babylon types for efficient per-frame reprojection.
 */
export type RebuiltAnnotationPin = {
	annotationId: string
	mesh: AbstractMesh | null
	localPosition: Vector3
	worldStatic: Vector3 | null
}

/**
 * useVeltBabylonComments
 * Encapsulates all Babylon ⇄ Velt wiring so scenes remain focused on rendering.
 *
 * Params
 * - engineRef/sceneRef/cameraRef/canvasRef: Babylon objects owned by the scene
 * - isPlayingRef: scene render state (we avoid capturing anchors while animating)
 * - ready: true when the scene/camera have been created (observer is attached then)
 *
 * Returns
 * - commentMode: whether Velt comment mode is enabled
 * - setClickedAnchor(world, mesh): helper to push anchors from custom picks
 * - clickedAnchorRef: latest built anchor (for diagnostics)
 * - rebuiltPins: annotation-derived pin data to render in any overlay/component
 */
export function useVeltBabylonComments(params: {
	sceneId: string,
	engineRef: React.MutableRefObject<Engine | null>
	sceneRef: React.MutableRefObject<Scene | null>
	cameraRef: React.MutableRefObject<ArcRotateCamera | null>
	canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
	isPlayingRef?: React.MutableRefObject<boolean>
	ready: boolean
	/** Optional custom resolver to map anchor.local mesh identity to a runtime mesh */
	resolveMesh?: (scene: Scene, local: { meshId: string; meshUniqueId: number; meshName: string } | undefined) => AbstractMesh | null
}) {
	const { sceneId, engineRef, sceneRef, cameraRef, canvasRef, isPlayingRef, ready, resolveMesh } = params

	const commentModeState = useCommentModeState()
	const commentModeStateRef = useRef<boolean>(false)
	// Mirror Velt comment mode to a ref for zero-cost checks in event handlers
	useEffect(() => {
		commentModeStateRef.current = !!commentModeState
		console.log('useVeltBabylonComments:commentMode changed', { commentMode: !!commentModeState })
	}, [commentModeState])

	const clickedAnchorRef = useRef<BabylonCommentAnchor | null>(null)
	const addHandler = useCommentAddHandler()
	useEffect(() => { /* keep hook wired */ }, [addHandler])

	// If the Velt addHandler becomes available AFTER a click, push the latest anchor
	useEffect(() => {
		console.log('useVeltBabylonComments:addHandler changed', addHandler, clickedAnchorRef.current)
		if (addHandler && sceneId && clickedAnchorRef.current) {
			try {
				const babylonAnchorData = {
					...clickedAnchorRef.current,
					sceneId,
				}
				addHandler.addContext({ babylonAnchorData, commentType: 'manual' })
			} catch (err) {
				console.error('useVeltBabylonComments:addContext on handler change error', err)
			}
		}
	}, [addHandler])

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

	// Expose a helper for scenes/components that perform their own picking
	const setClickedAnchor = (world: Vector3, mesh: AbstractMesh | null) => {
		const a = buildAnchor(world, mesh)
		if (!a) return
		clickedAnchorRef.current = a
		// try {
		// 	addHandler?.addContext?.({ babylonAnchorData: a, commentType: 'manual' })
		// 	console.log('useVeltBabylonComments:addContext via setClickedAnchor success')
		// } catch (err) {
		// 	console.error('useVeltBabylonComments:addContext via setClickedAnchor error', err)
		// }
	}

	// Attach Babylon pointer observer (when ready) so our anchor capture runs
	// before global DOM click handlers. This avoids races with Velt's flows.
	useEffect(() => {
		const scene = sceneRef.current
		const camera = cameraRef.current
		if (!ready) {
			console.log('useVeltBabylonComments:observer not attached (not ready)')
			return
		}
		if (!scene || !camera) {
			console.log('useVeltBabylonComments:observer not attached (scene/camera missing)')
			return
		}
		console.log('useVeltBabylonComments:attaching pointer observer')
		const observer = scene.onPointerObservable.add((info) => {
			if (info.type !== PointerEventTypes.POINTERDOWN) return
			if (isPlayingRef?.current) return
			if (!commentModeStateRef.current) return
			console.log('useVeltBabylonComments:pointerDown')
			const rect = canvasRef.current?.getBoundingClientRect()
			if (!rect) return
			const evt = info.event as PointerEvent
			const px = evt.clientX - rect.left
			const py = evt.clientY - rect.top
			const pick = scene.pick(px, py)
			let world: Vector3 | null = null
			let mesh: AbstractMesh | null = null
			if (pick && pick.hit && pick.pickedPoint) {
				world = pick.pickedPoint.clone()
				mesh = pick.pickedMesh ?? null
			} else {
				const ray = scene.createPickingRay(px, py, Matrix.Identity(), camera)
				const normal = new Vector3(0, 1, 0)
				const denom = Vector3.Dot(normal, ray.direction)
				if (Math.abs(denom) > 1e-6) {
					const t = Vector3.Dot(normal, ray.origin.scale(-1)) / denom
					world = t >= 0 ? ray.origin.add(ray.direction.scale(t)) : null
				} else {
					world = null
				}
				mesh = null
			}
			if (!world) return
			const clickedAnchor = buildAnchor(world, mesh);
			if (!clickedAnchor) return;
			clickedAnchorRef.current = clickedAnchor;
		}, PointerEventTypes.POINTERDOWN, true)
		return () => { if (scene && observer) scene.onPointerObservable.remove(observer) }
	}, [commentModeStateRef, isPlayingRef, sceneRef, cameraRef, buildAnchor, ready, canvasRef, addHandler])

	// Build pins from existing annotations
	const allAnnotations = useCommentAnnotations()
	const annotations = useMemo(() => {
		return allAnnotations?.filter((annotation) => annotation?.context?.babylonAnchorData?.sceneId === sceneId)
	}, [allAnnotations, sceneId])
	const rebuiltPins = useMemo<RebuiltAnnotationPin[]>(() => {
		const scene = sceneRef.current
		if (!scene || !annotations) return []
		const pins: RebuiltAnnotationPin[] = []
		for (const ann of annotations) {
			const ctx = (ann as unknown as { context?: Record<string, unknown> | undefined }).context
			const anchor = ctx?.babylonAnchorData as (BabylonCommentAnchor | undefined)
			if (!anchor) continue
			let mesh: AbstractMesh | null = null
			let localPosition = new Vector3(0, 0, 0)
			let worldStatic: Vector3 | null = null
			if (anchor.isOnMesh && anchor.local) {
				// Allow caller to override mesh resolution logic
				mesh = resolveMesh?.(scene, { meshId: anchor.local.meshId, meshUniqueId: anchor.local.meshUniqueId, meshName: anchor.local.meshName }) ?? null
				if (!mesh) {
					if (anchor.local.meshId) {
						mesh = scene.getMeshById(anchor.local.meshId)
					}
					if (!mesh && 'getMeshByUniqueId' in scene) {
						mesh = scene.getMeshByUniqueId(anchor.local.meshUniqueId)
					}
					if (!mesh) {
						mesh = scene.getMeshByName(anchor.local.meshName)
					}
				}
				localPosition = new Vector3(anchor.local.x, anchor.local.y, anchor.local.z)
				// Fallback: if target mesh not present in this scene, use stored world position
				if (!mesh && anchor.world) {
					worldStatic = new Vector3(anchor.world.x, anchor.world.y, anchor.world.z)
				}
			} else if (anchor.world) {
				worldStatic = new Vector3(anchor.world.x, anchor.world.y, anchor.world.z)
			}
			pins.push({
				annotationId: (ann as unknown as { annotationId?: string }).annotationId ?? '',
				mesh,
				localPosition,
				worldStatic,
			})
		}
		return pins
	}, [annotations, sceneRef, resolveMesh])

	return {
		commentMode: !!commentModeState,
		setClickedAnchor,
		clickedAnchorRef,
		rebuiltPins,
	}
}