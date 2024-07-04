let bunny1, bunny2;
let port;
let reader;
let inputDone;
let outputDone;
let inputStream;
let outputStream;
let showCalibration = false;

let orientation1 = [0, 0, 0];
let quaternion1 = [1, 0, 0, 0];
let orientation2 = [0, 0, 0];
let quaternion2 = [1, 0, 0, 0];

const maxLogLength = 100;
const baudRates = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400];

const log = document.getElementById('log');
const butConnect = document.getElementById('butConnect');
const butClear = document.getElementById('butClear');
const baudRate = document.getElementById('baudRate');
const autoscroll = document.getElementById('autoscroll');
const showTimestamp = document.getElementById('showTimestamp');
const angleType = document.getElementById('angle_type');
const lightSS = document.getElementById('light');
const darkSS = document.getElementById('dark');
const darkMode = document.getElementById('darkmode');
const canvas = document.querySelector('#canvas');
const calContainer = document.getElementById('calibration');
const logContainer = document.getElementById("log-container");

fitToContainer(canvas);

function fitToContainer(canvas){
  // Make it visually fill the positioned parent
  canvas.style.width ='100%';
  canvas.style.height='100%';
  // ...then set the internal size to match
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!('serial' in navigator)) {
    alert('Sorry, Web Serial is not supported on this device. Make sure you\'re running Chrome 78 or later and have enabled the #enable-experimental-web-platform-features flag in chrome://flags');
    return;
  }

  if (!isWebGLAvailable()) {
    alert('Sorry, WebGL is not supported on this device.');
    return;
  }

  butConnect.addEventListener('click', clickConnect);
  butClear.addEventListener('click', clickClear);
  autoscroll.addEventListener('click', clickAutoscroll);
  showTimestamp.addEventListener('click', clickTimestamp);
  baudRate.addEventListener('change', changeBaudRate);
  angleType.addEventListener('change', changeAngleType);
  darkMode.addEventListener('click', clickDarkMode);

  initBaudRate();
  loadAllSettings();
  updateTheme();
  await finishDrawing();
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

const renderer = new THREE.WebGLRenderer({ canvas: canvas });
const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
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
    bunny1 = root.clone();
    bunny1.position.set(-15, 0, 0); // Set bunny1 to the left
    scene.add(bunny1);

    bunny2 = root.clone();
    bunny2.position.set(15, 0, 0); // Set bunny2 to the right
    scene.add(bunny2);
  });
}

async function connect() {
  // - Request a port and open a connection.
  port = await navigator.serial.requestPort();
  // - Wait for the port to open.
  await port.open({ baudRate: baudRate.value });

  let decoder = new TextDecoderStream();
  inputDone = port.readable.pipeTo(decoder.writable);
  inputStream = decoder.readable
    .pipeThrough(new TransformStream(new LineBreakTransformer()));

  reader = inputStream.getReader();
  readLoop().catch(async function(error) {
    toggleUIConnected(false);
    await disconnect();
  });
}

async function disconnect() {
  if (reader) {
    await reader.cancel();
    await inputDone.catch(() => {});
    reader = null;
    inputDone = null;
  }

  if (outputStream) {
    await outputStream.getWriter().close();
    await outputDone;
    outputStream = null;
    outputDone = null;
  }

  await port.close();
  port = null;
  showCalibration = false;
}

async function readLoop() {
  while (true) {
    const {value, done} = await reader.read();
    if (value) {
      if (value.startsWith("Sensor 1 Orientation:")) {
        orientation1 = value.substr(21).trim().split(",").map(x => +x);
      } else if (value.startsWith("Sensor 2 Orientation:")) {
        orientation2 = value.substr(21).trim().split(",").map(x => +x);
      } else if (value.startsWith("Sensor 1 Quaternion:")) {
        quaternion1 = value.substr(20).trim().split(",").map(x => +x);
      } else if (value.startsWith("Sensor 2 Quaternion:")) {
        quaternion2 = value.substr(20).trim().split(",").map(x => +x);
      }
    }
    if (done) {
      console.log('[readLoop] DONE', done);
      reader.releaseLock();
      break;
    }
  }
}

function logData(line) {
  // Update the Log
  if (showTimestamp.checked) {
    let d = new Date();
    let timestamp = d.getHours() + ":" + `${d.getMinutes()}`.padStart(2, 0) + ":" +
        `${d.getSeconds()}`.padStart(2, 0) + "." + `${d.getMilliseconds()}`.padStart(3, 0);
    log.innerHTML += '<span class="timestamp">' + timestamp + ' -> </span>';
    d = null;
  }
  log.innerHTML += line + "<br>";

  // Remove old log content
  if (log.textContent.split("\n").length > maxLogLength + 1) {
    let logLines = log.innerHTML.replace(/(\n)/gm, "").split("<br>");
    log.innerHTML = logLines.splice(-maxLogLength).join("<br>\n");
  }

  if (autoscroll.checked) {
    log.scrollTop = log.scrollHeight
  }
}

function updateTheme() {
  // Disable all themes
  document
    .querySelectorAll('link[rel=stylesheet].alternate')
    .forEach((styleSheet) => {
      enableStyleSheet(styleSheet, false);
    });

  if (darkMode.checked) {
    enableStyleSheet(darkSS, true);
  } else {
    enableStyleSheet(lightSS, true);
  }

  if (showCalibration && !logContainer.classList.contains('show-calibration')) {
    logContainer.classList.add('show-calibration')
  } else if (!showCalibration && logContainer.classList.contains('show-calibration')) {
    logContainer.classList.remove('show-calibration')
  }
}

function enableStyleSheet(node, enabled) {
  node.disabled = !enabled;
}

function reset() {
  // Clear the data
  log.innerHTML = "";
}

async function clickConnect() {
  if (port) {
    await disconnect();
    toggleUIConnected(false);
    return;
  }

  await connect();

  reset();

  toggleUIConnected(true);
}

async function clickAutoscroll() {
  saveSetting('autoscroll', autoscroll.checked);
}

async function clickTimestamp() {
  saveSetting('timestamp', showTimestamp.checked);
}

async function changeBaudRate() {
  saveSetting('baudrate', baudRate.value);
}

async function changeAngleType() {
  saveSetting('angletype', angleType.value);
}

async function clickDarkMode() {
  updateTheme();
  saveSetting('darkmode', darkMode.checked);
}

async function clickClear() {
  reset();
}

async function finishDrawing() {
  return new Promise(requestAnimationFrame);
}

function toggleUIConnected(connected) {
  let lbl = 'Connect';
  if (connected) {
    lbl = 'Disconnect';
  }
  butConnect.textContent = lbl;
  updateTheme()
}

function initBaudRate() {
  for (let rate of baudRates) {
    var option = document.createElement("option");
    option.text = rate + " Baud";
    option.value = rate;
    baudRate.add(option);
  }
}

function loadAllSettings() {
  // Load all saved settings or defaults
  autoscroll.checked = loadSetting('autoscroll', true);
  showTimestamp.checked = loadSetting('timestamp', false);
  baudRate.value = loadSetting('baudrate', 9600);
  angleType.value = loadSetting('angletype', 'quaternion');
  darkMode.checked = loadSetting('darkmode', false);
}

function loadSetting(setting, defaultValue) {
  let value = JSON.parse(window.localStorage.getItem(setting));
  if (value == null) {
    return defaultValue;
  }

  return value;
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

  if (bunny1 && bunny2) {
    if (angleType.value == "euler") {
      // Sensor 1
      let rotationEuler1 = new THREE.Euler(
        THREE.MathUtils.degToRad(360 - orientation1[2]),
        THREE.MathUtils.degToRad(orientation1[0]),
        THREE.MathUtils.degToRad(orientation1[1]),
        'YZX'
      );
      bunny1.setRotationFromEuler(rotationEuler1);

      // Sensor 2
      let rotationEuler2 = new THREE.Euler(
        THREE.MathUtils.degToRad(360 - orientation2[2]),
        THREE.MathUtils.degToRad(orientation2[0]),
        THREE.MathUtils.degToRad(orientation2[1]),
        'YZX'
      );
      bunny2.setRotationFromEuler(rotationEuler2);
    } else {
      // Sensor 1
      let rotationQuaternion1 = new THREE.Quaternion(quaternion1[1], quaternion1[3], -quaternion1[2], quaternion1[0]);
      bunny1.setRotationFromQuaternion(rotationQuaternion1);

      // Sensor 2
      let rotationQuaternion2 = new THREE.Quaternion(quaternion2[1], quaternion2[3], -quaternion2[2], quaternion2[0]);
      bunny2.setRotationFromQuaternion(rotationQuaternion2);
    }
  }

  renderer.render(scene, camera);
  await finishDrawing();
  requestAnimationFrame(render);
}

class LineBreakTransformer {
  constructor() {
    this.container = '';
  }

  transform(chunk, controller) {
    this.container += chunk;
    const lines = this.container.split('\n');
    this.container = lines.pop();
    lines.forEach(line => {
      controller.enqueue(line);
      logData(line);
    });
  }

  flush(controller) {
    controller.enqueue(this.container);
  }
}

function updateCalibration() {
  // Update the Calibration Container with the values from calibration
  const calMap = [
    {caption: "Uncalibrated",         color: "#CC0000"},
    {caption: "Partially Calibrated", color: "#FF6600"},
    {caption: "Mostly Calibrated",    color: "#FFCC00"},
    {caption: "Fully Calibrated",     color: "#009900"},
  ];
  const calLabels = [
    "System", "Gyro", "Accelerometer", "Magnetometer"
  ];

  calContainer.innerHTML = "";
  for (let i = 0; i < calibration.length; i++) {
    const calInfo = calMap[calibration[i]];
    const element = document.createElement("div");
    element.innerHTML = calLabels[i] + ": " + calInfo.caption;
    element.style = "color: " + calInfo.color;
    calContainer.appendChild(element);
  }
}
