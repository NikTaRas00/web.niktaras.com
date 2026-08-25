// Physically-based sky + image-based lighting. The Sky shader gives a real atmospheric
// scattering gradient (much better than a flat background color), and baking it through
// PMREMGenerator gives every reflective material (car paint, wet-look asphalt) a matching
// environment reflection for free — the standard three.js technique for outdoor IBL.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { VISUAL } from './config.js';

export function setupEnvironment(scene, renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const sky = new Sky();
  sky.scale.setScalar(20000);
  const sun = new THREE.Vector3();
  const elevation = 32, azimuth = 200; // late-afternoon angle: long soft shadows, warm light
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sun.setFromSphericalCoords(1, phi, theta);

  sky.material.uniforms.sunPosition.value.copy(sun);
  sky.material.uniforms.turbidity.value = 3.2;
  sky.material.uniforms.rayleigh.value = 1.6;
  sky.material.uniforms.mieCoefficient.value = 0.006;
  sky.material.uniforms.mieDirectionalG.value = 0.8;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(sky, 0.04).texture;

  // the Sky mesh itself isn't added to the scene — its baked env map lights everything,
  // and scene.background stays a solid color + fog so distant hills fade out believably
  scene.background = new THREE.Color(0x9fc3dd);
  scene.fog = new THREE.Fog(0x9fc3dd, VISUAL.fogNear, VISUAL.fogFar);

  // bounce off pavement rather than off grass, so nothing picks up a green cast from below
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x4b4d52, 0.5));

  const sunLight = new THREE.DirectionalLight(0xfff2d9, 1.35);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -VISUAL.shadowFrustum;
  sunLight.shadow.camera.right = VISUAL.shadowFrustum;
  sunLight.shadow.camera.top = VISUAL.shadowFrustum;
  sunLight.shadow.camera.bottom = -VISUAL.shadowFrustum;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 1400;
  sunLight.shadow.bias = -0.0009;
  sunLight.shadow.normalBias = 0.05;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const sunDir = sun.clone().normalize();

  // the city is far bigger than any single shadow frustum can crisply cover, so instead of sizing
  // the frustum to the whole map, the light + target re-center on the car every frame. It sits
  // well back so tower blocks stay inside the frustum and throw their shadows down the streets.
  function followTarget(x, y, z) {
    sunLight.position.set(x + sunDir.x * 520, y + Math.max(240, sunDir.y * 520), z + sunDir.z * 520);
    sunLight.target.position.set(x, y, z);
    sunLight.target.updateMatrixWorld();
  }

  pmrem.dispose();
  return { sunLight, followTarget };
}
