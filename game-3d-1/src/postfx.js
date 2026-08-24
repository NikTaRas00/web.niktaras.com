import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.35 } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float vig = 1.0 - smoothstep(0.35, 0.9, length(d)) * strength;
      color.rgb *= vig;
      gl_FragColor = color;
    }
  `,
};

export function setupPostFX(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.4, 0.86);
  composer.addPass(bloom);

  composer.addPass(new ShaderPass(VignetteShader));

  // OutputPass applies tone mapping + output color space — must run before the AA pass, which
  // expects the final LDR sRGB image, not the linear HDR data the earlier passes work in.
  composer.addPass(new OutputPass());

  const smaa = new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  composer.addPass(smaa);

  function onResize() {
    composer.setSize(innerWidth, innerHeight);
    bloom.setSize(innerWidth, innerHeight);
  }

  return { composer, onResize };
}
