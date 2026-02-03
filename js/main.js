/**
 * Asynchronously loads a single HTML component.
 * @param {string} url - Path to the component HTML file.
 * @param {string} targetId - ID of the placeholder div to inject content into.
 */
async function loadComponent(url, targetId) {
  try {
    console.log(`Attempting to load: ${url} into #${targetId}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch component file. Check path: ${url}. Status: ${response.statusText}`);
    }
    const text = await response.text();
    const target = document.getElementById(targetId);
    if (target) {
      target.innerHTML = text;
    } else {
      console.warn(`Component target DIV not found: #${targetId}`);
    }
  } catch (err) {
    console.error('--- Component Loading Error ---', err);
  }
}

/**
 * Loads all specified HTML components in parallel.
 */
async function loadAllComponents() {
  const components = [
    { url: 'components/panel-environment-params.html', id: 'loader-panel-environment-params' },
    { url: 'components/panel-orbit-params.html', id: 'loader-panel-orbit-params' },
    { url: 'components/panel-terminal-params.html', id: 'loader-panel-terminal-params' },
    { url: 'components/panel-device-params.html', id: 'loader-panel-device-params' },
    { url: 'components/panel-task-params.html', id: 'loader-panel-task-params' }
  ];
  await Promise.all(components.map(comp => loadComponent(comp.url, comp.id)));
}

// --- 全局仿真状态管理系统 ---
const SIMULATION_STATES = {
  STOPPED: 'stopped',
  RUNNING: 'running',
  PAUSED: 'paused'
};

let simulationState = SIMULATION_STATES.STOPPED;
let simulationStartTime = 0; // 仿真开始的时间戳
let simulationPausedTime = 0; // 暂停时的累计运行时间
let totalPausedDuration = 0; // 总暂停时长

// --- 参数输入状态管理 ---
const paramInputStatus = {
  'panel-environment-params': false,
  'panel-orbit-params': false,
  'panel-terminal-params': false,
  'panel-device-params': false,
  'panel-task-params': false
};

// --- Three.js 场景变量 ---
let terminal1 = { scene: null, camera: null, renderer: null, azimuth: null, elevation: null, controls: null };
let terminal2 = { scene: null, camera: null, renderer: null, azimuth: null, elevation: null, controls: null };

// --- ECharts 变量与数据 ---
let charts = { loss: null, ber: null, gain: null };
let simulationData = []; // 存储解析后的 CSV 数据
let chartData = { loss: [], ber: [], gain: [] }; // 存储已绘制的点

/**
 * 检查是否所有参数都已就绪
 */
function areAllParamsReady() {
  return Object.values(paramInputStatus).every(status => status === true);
}

/**
 * 开始或继续仿真
 */
function startSimulation() {
  if (!areAllParamsReady()) {
    alert("请先完成所有参数配置！");
    return;
  }

  if (simulationState === SIMULATION_STATES.STOPPED) {
    simulationStartTime = Date.now();
    simulationPausedTime = 0;
    totalPausedDuration = 0;
    simulationState = SIMULATION_STATES.RUNNING;
    updateSimulationButtons();
    console.log('仿真开始');
  } else if (simulationState === SIMULATION_STATES.PAUSED) {
    totalPausedDuration += Date.now() - simulationPausedTime;
    simulationState = SIMULATION_STATES.RUNNING;
    updateSimulationButtons();
    console.log('仿真继续');
  }
}

/**
 * 暂停仿真
 */
function pauseSimulation() {
  if (simulationState === SIMULATION_STATES.RUNNING) {
    simulationPausedTime = Date.now();
    simulationState = SIMULATION_STATES.PAUSED;
    updateSimulationButtons();
    console.log('仿真暂停');
  }
}

/**
 * 停止仿真
 */
function stopSimulation() {
  if (simulationState !== SIMULATION_STATES.STOPPED) {
    simulationState = SIMULATION_STATES.STOPPED;
    updateSimulationButtons();
    console.log('仿真停止');
  }
}

/**
 * 更新仿真控制按钮的状态
 */
function updateSimulationButtons() {
  const startBtn = document.getElementById('sim-start-btn');
  const pauseBtn = document.getElementById('sim-pause-btn');
  const stopBtn = document.getElementById('sim-stop-btn');

  if (!startBtn || !pauseBtn || !stopBtn) return;

  const allReady = areAllParamsReady();

  switch (simulationState) {
    case SIMULATION_STATES.STOPPED:
      startBtn.disabled = !allReady;
      startBtn.textContent = '▶ 运行';
      startBtn.title = allReady ? "开始仿真" : "请先完成左侧所有参数配置";
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      break;
    case SIMULATION_STATES.RUNNING:
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
      break;
    case SIMULATION_STATES.PAUSED:
      startBtn.disabled = false;
      startBtn.textContent = '▶ 继续';
      pauseBtn.disabled = true;
      stopBtn.disabled = false;
      break;
  }
}

/**
 * 获取当前仿真运行时间（秒）
 */
function getSimulationTime() {
  if (simulationState === SIMULATION_STATES.STOPPED) return 0;
  let currentTime = Date.now();
  let totalElapsed = 0;
  if (simulationState === SIMULATION_STATES.RUNNING) {
    totalElapsed = (currentTime - simulationStartTime) - totalPausedDuration;
  } else if (simulationState === SIMULATION_STATES.PAUSED) {
    totalElapsed = (simulationPausedTime - simulationStartTime) - totalPausedDuration;
  }
  return Math.max(0, totalElapsed / 1000);
}

/**
 * 创建单个终端模型实例
 */
function createTerminalInstance(containerId, termObj) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // 1. 基础场景设置
  termObj.scene = new THREE.Scene();
  termObj.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
  termObj.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  termObj.renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(termObj.renderer.domElement);

  // 2. 创建模型层级结构
  termObj.azimuth = new THREE.Group();

  // 底座
  const baseGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 32);
  const silverMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, specular: 0x111111 });
  const baseMesh = new THREE.Mesh(baseGeo, silverMat);
  baseMesh.position.y = -0.1;
  termObj.scene.add(baseMesh);

  // U型支架
  const yokeBaseGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.6, 32);
  const darkMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
  const yokeMesh = new THREE.Mesh(yokeBaseGeo, darkMat);
  termObj.azimuth.add(yokeMesh);

  const pierGeo = new THREE.BoxGeometry(0.2, 1.2, 0.4);
  const pierL = new THREE.Mesh(pierGeo, darkMat);
  pierL.position.set(-0.6, 0.4, 0);
  const pierR = new THREE.Mesh(pierGeo, darkMat);
  pierR.position.set(0.6, 0.4, 0);
  termObj.azimuth.add(pierL);
  termObj.azimuth.add(pierR);

  // 俯仰角组
  termObj.elevation = new THREE.Group();
  termObj.elevation.position.y = 0.8;

  const mirrorGeo = new THREE.BoxGeometry(1.0, 0.1, 1.0);
  const mirrorMat = new THREE.MeshPhongMaterial({
    color: 0x4da8da,
    emissive: 0x112233,
    shininess: 100,
    transparent: true,
    opacity: 0.9
  });
  const mirrorMesh = new THREE.Mesh(mirrorGeo, mirrorMat);
  termObj.elevation.add(mirrorMesh);

  const mirrorShaftGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 16);
  mirrorShaftGeo.rotateZ(Math.PI / 2);
  const shaftMesh = new THREE.Mesh(mirrorShaftGeo, darkMat);
  termObj.elevation.add(shaftMesh);

  termObj.azimuth.add(termObj.elevation);
  termObj.scene.add(termObj.azimuth);

  // 3. 灯光
  const ambientLight = new THREE.AmbientLight(0x404040, 2);
  termObj.scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 5, 5);
  termObj.scene.add(directionalLight);

  termObj.camera.position.set(2.2, 1.5, 3);
  termObj.camera.lookAt(0, 0.5, 0);

  // 4. 轨道控制器
  termObj.controls = new THREE.OrbitControls(termObj.camera, termObj.renderer.domElement);
  termObj.controls.enableDamping = true;
  termObj.controls.minDistance = 1.5;
  termObj.controls.maxDistance = 10;
  termObj.controls.target.set(0, 0.5, 0);
}

function initThreeJS() {
  createTerminalInstance('threejs-viz-1', terminal1);
  createTerminalInstance('threejs-viz-2', terminal2);

  window.addEventListener('resize', () => {
    [terminal1, terminal2].forEach(t => {
      if (t.renderer) {
        const container = t.renderer.domElement.parentElement;
        t.camera.aspect = container.clientWidth / container.clientHeight;
        t.camera.updateProjectionMatrix();
        t.renderer.setSize(container.clientWidth, container.clientHeight);
      }
    });
    Object.values(charts).forEach(c => c && c.resize());
  });
}

/**
 * 将 CSV 字符串转换为对象数组
 */
function csvToArray(str, delimiter = ",") {
  const headers = str.slice(0, str.indexOf("\n")).split(delimiter).map(h => h.trim());
  const rows = str.slice(str.indexOf("\n") + 1).split("\n");
  return rows.map(row => {
    const values = row.split(delimiter);
    return headers.reduce((obj, header, i) => {
      obj[header] = parseFloat(values[i]);
      return obj;
    }, {});
  }).filter(item => !isNaN(item.step));
}

/**
 * 加载仿真 CSV 数据
 */
async function loadSimulationData() {
  try {
    const response = await fetch('SwapDatas/sim_results.csv');
    const csvText = await response.text();
    simulationData = csvToArray(csvText);
    console.log("CSV Data loaded:", simulationData.length, "rows");
  } catch (err) {
    console.error("Failed to load CSV:", err);
  }
}

/**
 * 初始化 ECharts 图表
 */
function initCharts() {
  const commonOption = (title, color) => ({
    backgroundColor: 'transparent',
    title: { text: title, textStyle: { color: '#666', fontSize: 10 }, left: 5, top: 5 },
    grid: { left: '15%', right: '10%', bottom: '15%', top: '25%' },
    xAxis: { type: 'value', name: 'Time', splitLine: { show: false }, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#222' } }, axisLabel: { fontSize: 9 } },
    series: [{ type: 'line', showSymbol: true, symbolSize: 4, data: [], itemStyle: { color: color }, lineStyle: { width: 1 } }]
  });

  charts.loss = echarts.init(document.getElementById('chart-link-loss'));
  charts.loss.setOption(commonOption('眼图1', '#188038'));

  charts.ber = echarts.init(document.getElementById('chart-ber'));
  charts.ber.setOption(commonOption('眼图2', '#d93025'));
  // 误码率通常是对数坐标
  charts.ber.setOption({ yAxis: { type: 'log', min: 1e-8 } });

  charts.gain = echarts.init(document.getElementById('chart-gain'));
  charts.gain.setOption(commonOption('FOU', '#1a73e8'));
}

function initializeApp() {
  const openPanelButtons = document.querySelectorAll('.param-item[data-panel-target]');
  let modalOverlay = document.querySelector('.modal-overlay');

  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    document.body.appendChild(modalOverlay);
  }

  function openPanel(panel) {
    if (panel) {
      panel.classList.add('visible');
      modalOverlay.classList.add('visible');
      document.body.style.overflow = 'hidden';
    }
  }

  function closePanel(panel) {
    if (panel) {
      panel.classList.remove('visible');
      modalOverlay.classList.remove('visible');
      document.body.style.overflow = '';
    }
  }

  console.log(`Initialized app with ${openPanelButtons.length} panel buttons.`);

  // 一键确认逻辑
  const quickConfirmBtn = document.getElementById('btn-quick-confirm');
  if (quickConfirmBtn) {
    quickConfirmBtn.addEventListener('click', () => {
      console.log("Quick confirming all parameters...");
      
      // 1. 更新所有状态
      Object.keys(paramInputStatus).forEach(id => {
        paramInputStatus[id] = true;
        const triggerBtn = document.querySelector(`.param-item[data-panel-target="${id}"]`);
        if (triggerBtn) triggerBtn.classList.add('confirmed');
      });

      // 2. 更新 UI 信息栏
      updateSimulationButtons();
      updateStatusBarText();

      // 3. 记录日志
      const date = new Date();
      const timeStr = date.toISOString().substr(11, 8);
      logHistory.push({ 
        time: getSimulationTime(), 
        msg: `[${timeStr}] 用户激活: 一键确认所有配置参数。` 
      });
      
      // 4. 触发导出
      exportConfigToCSV();
      
      alert("所有参数已一键确认，配置已同步至后端。");
    });
  }

  // 为所有带 data-panel-target 的按钮绑定点击事件
  openPanelButtons.forEach(button => {
    button.addEventListener('click', () => {
      const panelId = button.dataset.panelTarget;
      console.log(`Button clicked: ${panelId}`);
      if (!panelId) return;

      // 关闭当前所有已打开的面板
      document.querySelectorAll('.secondary-panel.visible').forEach(v => closePanel(v));

      const panel = document.getElementById(panelId);
      if (panel) {
        console.log(`Found panel in DOM, opening: ${panelId}`);
        openPanel(panel);
      } else {
        console.error(`PANEL ERROR: ID "${panelId}" not found in DOM!`);
        alert(`错误: 找不到 ID 为 "${panelId}" 的配置面板。请检查组件是否加载成功。`);
      }
    });
  });

  // 全局点击处理：处理关闭按钮、取消按钮和遮罩层点击
  document.addEventListener('click', (event) => {
    const target = event.target;

    // 点击关闭按钮 (×) 或 取消按钮
    if (target.matches('.secondary-panel-close') || target.matches('.btn-cancel')) {
      const panel = target.closest('.secondary-panel');
      closePanel(panel);
    }

    // 点击遮罩层关闭
    if (target === modalOverlay) {
      const visiblePanel = document.querySelector('.secondary-panel.visible');
      if (visiblePanel) closePanel(visiblePanel);
    }

    // 点击确认保存
    if (target.matches('.btn-save')) {
      const panel = target.closest('.secondary-panel');
      if (panel) {
        handleSave(panel);
      }
    }
  });

  /**
   * 处理保存逻辑
   */
  function handleSave(panel) {
    if (paramInputStatus.hasOwnProperty(panel.id)) {
      paramInputStatus[panel.id] = true;
      // 更新按钮样式为“已完成”
      const triggerBtn = document.querySelector(`.param-item[data-panel-target="${panel.id}"]`);
      if (triggerBtn) triggerBtn.classList.add('confirmed');
    }

    updateSimulationButtons();
    updateStatusBarText();
    closePanel(panel);

    // 检查是否全部完成，如果完成则直接导出 CSV
    if (areAllParamsReady()) {
      console.log("All parameters ready. Auto-exporting to SwapDatas/InputDatas.csv...");
      // 注意：浏览器安全限制无法直接保存到特定物理文件夹，将触发名为 InputDatas.csv 的下载
      exportConfigToCSV();
    }
  }

  /**
   * 遍历所有面板提取数据并发送至 Python 后端
   */
  async function exportConfigToCSV() {
    let dataToSave = [];
    const panelIds = Object.keys(paramInputStatus);

    panelIds.forEach(id => {
      const panel = document.getElementById(id);
      if (!panel) return;

      const panelTitle = panel.querySelector('h2').textContent;
      const groups = panel.querySelectorAll('.form-group');

      groups.forEach(group => {
        const labelText = group.querySelector('label')?.textContent.replace(/,/g, "") || "Unknown";
        let value = "";

        const input = group.querySelector('input');
        const select = group.querySelector('select');

        if (input) {
          value = input.value;
        } else if (select) {
          value = select.options[select.selectedIndex].text;
        }

        if (value !== "") {
          dataToSave.push({
            panel: panelTitle,
            parameter: labelText,
            value: value
          });
        }
      });
    });

    console.log("Sending data to backend:", dataToSave);

    // 发送 POST 请求到 Python 后端 (统一端口使用相对路径)
    try {
      const response = await fetch('/api/save-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSave),
      });

      const result = await response.json();
      if (result.status === 'success') {
        console.log("Configuration saved to SwapDatas/InputDatas.csv");
      } else {
        console.error("Save failed:", result.message);
        fallbackDownload(dataToSave);
      }
    } catch (err) {
      console.warn("Backend server not running. Falling back to browser download.");
      fallbackDownload(dataToSave);
    }
  }

  /**
   * 降级方案：如果后端没启动，则触发浏览器普通下载
   */
  function fallbackDownload(data) {
    let csvRows = ["Panel,Parameter,Value"];
    data.forEach(item => {
      csvRows.push(`${item.panel},${item.parameter},${item.value}`);
    });
    const csvContent = "\ufeff" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "InputDatas.csv";
    link.click();
  }

  function updateStatusBarText() {
    const statusBarText = document.querySelector('.status-bar-left span');
    if (!statusBarText) return;

    if (areAllParamsReady()) {
      statusBarText.textContent = "系统状态: 就绪 (参数配置完成)";
      statusBarText.style.color = "#188038";
    } else {
      const remaining = Object.values(paramInputStatus).filter(v => !v).length;
      statusBarText.textContent = `系统状态: 等待配置 (剩余 ${remaining} 项)`;
      statusBarText.style.color = "#d93025";
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const visiblePanel = document.querySelector('.secondary-panel.visible');
      if (visiblePanel) closePanel(visiblePanel);
    }
  });

  const simulationButtons = document.querySelectorAll('.simulation-btn');
  simulationButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'start') startSimulation();
      else if (action === 'pause') pauseSimulation();
      else if (action === 'stop') stopSimulation();
    });
  });

  updateSimulationButtons();
  initializeSimulationTimer();
}

function setRunMode(mode) {
  const btnAuto = document.getElementById('btn-mode-auto');
  const btnStep = document.getElementById('btn-mode-step');
  if (mode === 'auto') {
    btnAuto.classList.add('btn-primary');
    btnStep.classList.remove('btn-primary');
  } else {
    btnStep.classList.add('btn-primary');
    btnAuto.classList.remove('btn-primary');
  }
}

function initializeSimulationTimer() {
  const timeValueElement = document.querySelector('#status-monitor #simulation-time-value'); // Fixed ID
  // Wait, in main.html it was a querySelector('#simulation-time .value span')
  // I should make sure the IDs match in index.html later.

  const timelineSlider = document.getElementById('sim-timeline');
  const timelineTimeDisplay = document.getElementById('current-timeline-time');
  const logBox = document.getElementById('event-stream-container');

  if (!timelineSlider || !logBox) return;

  let displayTime = 0.0;
  let isDragging = false;
  let logHistory = [
    { time: 0.0, msg: "[系统初始化] 等待仿真指令..." },
    { time: 0.1, msg: "[00:00:00] 仿真开始。" },
    { time: 1.5, msg: "[00:00:01] 加载星座配置 StarLink-Phase1... 完成。" },
    { time: 3.2, msg: "[00:00:03] 计算初始化轨道参数..." },
    { time: 5.5, msg: "[00:00:05] 正在扫描可见链路..." },
    { time: 8.0, msg: "[00:00:08] 链路 L-001 (SAT-01 <-> SAT-02) 建立成功 (SNR: 12.4dB)." },
    { time: 9.2, msg: "[00:00:09] 链路 L-005 (SAT-03 <-> SAT-04) 建立成功 (SNR: 11.8dB)." },
    { time: 12.5, msg: "[00:00:12] 警告: SAT-05 能量不足，进入省电模式。" },
    { time: 15.0, msg: "[00:00:15] 拓扑更新: 3 条链路因地球遮挡断开。" },
    { time: 22.1, msg: "[00:00:22] 收到地面站 G-01 上行指令。" },
    { time: 35.0, msg: "[00:00:35] 路由表重收敛完成。" },
    { time: 48.0, msg: "[00:00:48] 链路 L-089 (SAT-12 <-> SAT-13) 误码率上升 (BER: 1.2e-4)。" },
    { time: 60.0, msg: "[00:01:00] 进入下一仿真周期。" },
    { time: 75.5, msg: "[00:01:15] 卫星 SAT-42 完成姿态机动。" },
    { time: 90.0, msg: "[00:01:30] 仿真数据自动保存。" }
  ];

  function updateUI() {
    const simTime = getSimulationTime();
    if (simulationState === SIMULATION_STATES.RUNNING && !isDragging) displayTime = simTime;
    if (!isDragging) timelineSlider.value = displayTime;

    const timeDisplayLarge = document.getElementById('simulation-time-display-large');
    if (timeDisplayLarge) timeDisplayLarge.textContent = simTime.toFixed(1);

    if (timelineTimeDisplay) {
      const date = new Date(null);
      date.setSeconds(displayTime);
      timelineTimeDisplay.textContent = date.toISOString().substr(11, 8);
    }
    renderLogs();
  }

  function renderLogs() {
    const visibleLogs = logHistory.filter(log => log.time <= displayTime);
    
    // 如果显示的条数没变，就不重复渲染以保证性能
    if (logBox.children.length === visibleLogs.length) return;

    logBox.innerHTML = '';
    visibleLogs.forEach(entry => {
      const p = document.createElement('p');
      p.className = 'log-entry';
      
      // 匹配 [HH:MM:SS] 格式的时间戳进行美化渲染
      const timeMatch = entry.msg.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
      if (timeMatch) {
        const timeStr = timeMatch[1];
        const content = entry.msg.replace(timeMatch[0], '').trim();
        p.innerHTML = `<span class="time">[${timeStr}]</span> ${content}`;
        if (content.includes('警告') || content.includes('断开')) p.classList.add('warning');
        if (content.includes('注入') || content.includes('事件')) p.style.color = 'var(--accent-color)';
      } else {
        p.textContent = entry.msg;
      }
      logBox.appendChild(p);
    });

    // 自动滚动到容器底部
    const container = logBox.parentElement;
    container.scrollTop = container.scrollHeight;
  }

  function generateRandomLog() {
    if (Math.random() > 0.98) {
      const simTime = getSimulationTime();
      const satId = Math.floor(Math.random() * 50) + 1;
      const snr = (Math.random() * 10 + 5).toFixed(1);
      const nowStr = new Date(simTime * 1000).toISOString().substr(11, 8);
      logHistory.push({ time: simTime, msg: `[${nowStr}] 实时监测: SAT-${satId} 信号波动 (SNR: ${snr}dB)` });
    }
  }

  timelineSlider.addEventListener('input', (e) => {
    isDragging = true;
    displayTime = parseFloat(e.target.value);
    updateUI();
  });

  timelineSlider.addEventListener('change', (e) => {
    isDragging = false;
    displayTime = parseFloat(e.target.value);
  });

  timelineSlider.addEventListener('mousedown', () => isDragging = true);
  timelineSlider.addEventListener('mouseup', () => isDragging = false);

  setInterval(() => {
    if (!isDragging) {
      const simTime = getSimulationTime();
      if (simulationState === SIMULATION_STATES.RUNNING) displayTime = simTime;
    }
    if (simulationState === SIMULATION_STATES.RUNNING) generateRandomLog();

    // 更新 3D 转台模型旋转
    if (terminal1.azimuth && terminal2.azimuth) {
      const time = getSimulationTime();
      const currentStepData = simulationData.find(d => d.time >= time - 0.05 && d.time <= time + 0.05);

      if (currentStepData) {
        // 终端 1 运动
        terminal1.azimuth.rotation.y = currentStepData.az1 * (Math.PI / 180);
        terminal1.elevation.rotation.x = currentStepData.el1 * (Math.PI / 180);

        // 终端 2 运动
        terminal2.azimuth.rotation.y = currentStepData.az2 * (Math.PI / 180);
        terminal2.elevation.rotation.x = currentStepData.el2 * (Math.PI / 180);

        updateChartData(currentStepData);
        updateSpotViz(currentStepData);
      } else {
        // 默认模拟运动
        terminal1.azimuth.rotation.y = time * 0.3;
        terminal1.elevation.rotation.x = Math.sin(time * 0.5) * 0.5;
        
        terminal2.azimuth.rotation.y = -time * 0.3;
        terminal2.elevation.rotation.x = Math.cos(time * 0.5) * 0.5;
      }

      [terminal1, terminal2].forEach(t => {
        if (t.controls) t.controls.update();
        if (t.renderer) t.renderer.render(t.scene, t.camera);
      });
    }

    updateUI();
  }, 100);
}

/**
 * 将新的仿真点推送到图表
 */
function updateChartData(data) {
  const time = data.time;

  // 避免重复添加相同时间的点
  if (chartData.loss.some(p => p[0] === time)) return;

  chartData.loss.push([time, data.link_loss]);
  chartData.ber.push([time, data.ber]);
  chartData.gain.push([time, data.antenna_gain]);

  // 保持最近 50 个点以防性能问题
  if (chartData.loss.length > 50) {
    chartData.loss.shift();
    chartData.ber.shift();
    chartData.gain.shift();
  }

  charts.loss.setOption({ series: [{ data: chartData.loss }] });
  charts.ber.setOption({ series: [{ data: chartData.ber }] });
  charts.gain.setOption({ series: [{ data: chartData.gain }] });
}

/**
 * 更新光斑视觉监测
 */
function updateSpotViz(data) {
  drawSpot('canvas-spot-1', data.spot1_x, data.spot1_y);
  drawSpot('canvas-spot-2', data.spot2_x, data.spot2_y);
}

function drawSpot(canvasId, offsetX, offsetY) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // 清除背景
  ctx.clearRect(0, 0, w, h);

  // 绘制十字准星
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h);
  ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
  ctx.stroke();

  // 绘制目标圆圈
  ctx.strokeStyle = '#ccc';
  ctx.beginPath();
  ctx.arc(w/2, h/2, 20, 0, Math.PI * 2);
  ctx.stroke();

  // 绘制光斑 (根据偏移量，假设坐标范围是 -2 到 2)
  const centerX = w/2 + (offsetX * (w/4));
  const centerY = h/2 + (offsetY * (h/4));

  ctx.fillStyle = 'rgba(217, 48, 37, 0.7)'; // 红色光斑
  ctx.shadowBlur = 10;
  ctx.shadowColor = 'red';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
  ctx.fill();
}

document.addEventListener('DOMContentLoaded', () => {
  loadAllComponents().then(() => {
    initializeApp();
    initThreeJS();
    initCharts();
    loadSimulationData();
    initEventTimeline();
  });
});

/**
 * 初始化事件进度条与工况注入联动
 */
function initEventTimeline() {
  const functionPanel = document.getElementById('function-control');
  const eventLine = document.getElementById('event-timeline');
  const simTimeline = document.getElementById('sim-timeline'); // 获取主进度条作为比例参考
  
  if (!functionPanel || !eventLine) return;

  functionPanel.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-tool');
    if (!btn) return;

    // 如果仿真没在运行，提示先运行
    if (simulationState !== SIMULATION_STATES.RUNNING) {
      console.warn("仿真未运行，无法标记实时事件时间点。");
      return;
    }

    const eventName = btn.textContent.trim();
    const currentTime = getSimulationTime();
    
    // 计算百分比位置 (假设满格是 100s, 对应 index.html 中的 01:40)
    // 注意：这里需要与主进度条的逻辑同步。目前主进度条 max 是 100。
    const maxTime = 100; 
    const percentage = (currentTime / maxTime) * 100;

    if (percentage <= 100) {
      const marker = document.createElement('div');
      marker.className = 'event-marker';
      marker.style.left = `${percentage}%`;
      marker.setAttribute('data-label', `${eventName} @ ${currentTime.toFixed(1)}s`);
      
      eventLine.appendChild(marker);
      console.log(`Event marked: ${eventName} at ${currentTime.toFixed(2)}s`);

      // 同时将事件同步到右侧“事件流”列表中
      const date = new Date(null);
      date.setSeconds(currentTime);
      const timeStr = date.toISOString().substr(11, 8);
      logHistory.push({ 
        time: currentTime, 
        msg: `[${timeStr}] 外部注入事件: ${eventName}` 
      });
    }
  });
}
