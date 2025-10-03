// Hook that bridges Babylon.js pointer/picking with Velt comments.
// Responsibilities:
// - Capture pointer clicks inside a Babylon scene and compute a stable 3D anchor
// - Reconstruct pins from existing Velt annotations so any scene can render them
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { Vector3 } from '@babylonjs/core';
import { useCommentAnnotations } from '@veltdev/react';
import { useMemo } from 'react';

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
 * Minimal structure the UI can consume to render a pin for a Velt annotation.
 * Values are real Babylon types for efficient per-frame reprojection.
 */
export type ComputedAnnotationPin = {
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
 * - computedPins: annotation-derived pin data to render in any overlay/component
 */
export function useVeltBabylonComments(params: {
	sceneId: string,
	sceneRef: React.MutableRefObject<Scene | null>
	/** Optional custom resolver to map anchor.local mesh identity to a runtime mesh */
	resolveMesh?: (scene: Scene, local: { meshId: string; meshUniqueId: number; meshName: string } | undefined) => AbstractMesh | null
}) {
	const { sceneId, sceneRef, resolveMesh } = params

	// Get all the annotations
	const allAnnotations = useCommentAnnotations();

	// Filter the annotations to only the ones that are in the current scene
	const annotations = useMemo(() => {
		return allAnnotations?.filter((annotation) => annotation?.context?.babylonAnchorData?.sceneId === sceneId);
	}, [allAnnotations, sceneId]);

	const computedPins = useMemo<ComputedAnnotationPin[]>(() => {
		const scene = sceneRef.current;
		if (!scene || !annotations) return [];
		const pins: ComputedAnnotationPin[] = [];
		for (const annotation of annotations) {
			const annotationContext = annotation.context;
			const anchor: BabylonCommentAnchor | undefined = annotationContext?.babylonAnchorData;
			if (!anchor) continue;
			let mesh: AbstractMesh | null = null;
			let localPosition = new Vector3(0, 0, 0);
			let worldStatic: Vector3 | null = null;
			if (anchor.isOnMesh && anchor.local) {
				// Allow caller to override mesh resolution logic
				mesh = resolveMesh?.(scene, { meshId: anchor.local.meshId, meshUniqueId: anchor.local.meshUniqueId, meshName: anchor.local.meshName }) ?? null;
				if (!mesh) {
					if (anchor.local.meshId) {
						mesh = scene.getMeshById(anchor.local.meshId);
					}
					if (!mesh && 'getMeshByUniqueId' in scene) {
						mesh = scene.getMeshByUniqueId(anchor.local.meshUniqueId);
					}
					if (!mesh) {
						mesh = scene.getMeshByName(anchor.local.meshName);
					}
				}
				localPosition = new Vector3(anchor.local.x, anchor.local.y, anchor.local.z);
				// Fallback: if target mesh not present in this scene, use stored world position
				if (!mesh && anchor.world) {
					worldStatic = new Vector3(anchor.world.x, anchor.world.y, anchor.world.z);
				}
			} else if (anchor.world) {
				worldStatic = new Vector3(anchor.world.x, anchor.world.y, anchor.world.z);
			}
			pins.push({
				annotationId: annotation.annotationId ?? '',
				mesh,
				localPosition,
				worldStatic,
			});
		}
		return pins
	}, [annotations, sceneRef, resolveMesh])

	return {
		computedPins,
	}
}