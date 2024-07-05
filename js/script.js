import * as THREE from 'three';
import { OBJLoader } from 'objloader';

let bunny;

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#canvas') });

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 30);

const scene = new THREE.Scene();
scene.background = new THREE.Color('black');

{
  const skyColor = 0xB1E1FF;  // light blue
  const groundColor = 0x666666;  // black
  const intensity = 0.5;
  const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
  scene.add(light);
}

{
  const color = 0xFFFFFF;
  const intensity = 1;
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(0, 10, 0);
  light.target.position.set(-5, 0, 0);
  scene.add(light);
  scene.add(light.target);
}

{
  const objLoader = new OBJLoader();
  objLoader.load('assets/bunny.obj', (root) => {
    bunny = root;
    scene.add(bunny);
  });
}

function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;
}

async function render() {
  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }

  if (bunny) {
    let rotationQuaternion = new THREE.Quaternion(1, 0, 0, 0); // Example rotation, replace with actual data
    bunny.setRotationFromQuaternion(rotationQuaternion);
  }

  renderer.render(scene, camera);
  await finishDrawing();
  requestAnimationFrame(render);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!isWebGLAvailable()) {
    alert('Sorry, WebGL is not supported on this device.');
    return;
  }

  requestAnimationFrame(render);
});

function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch (e) {
    return false;
  }
}

async function finishDrawing() {
  return new Promise(requestAnimationFrame);
}
