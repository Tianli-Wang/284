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
      console.warn(`Component target DIV not found in index.html: #${targetId}`);
    }
  } catch (err) {
    console.error('--- Component Loading Error ---', err);
    alert(`组件加载失败: ${url}. 请确认您通过本地服务器运行项目。`);
  }
}

/**
 * Loads all specified HTML components in parallel.
 */
async function loadAllComponents() {
  const components = [
    { url: 'components/panel-sim-control.html', id: 'loader-panel-sim-control' },
    { url: 'components/panel-orbit-maneuver.html', id: 'loader-panel-orbit-maneuver' },
    { url: 'components/panel-attitude-control.html', id: 'loader-panel-attitude-control' },
    { url: 'components/panel-link-calc.html', id: 'loader-panel-link-calc' },
    { url: 'components/panel-link-recovery.html', id: 'loader-panel-link-recovery' },
    { url: 'components/panel-topology-control.html', id: 'loader-panel-topology-control' },
    { url: 'components/panel-routing.html', id: 'loader-panel-routing' }
  ];
  await Promise.all(components.map(comp => loadComponent(comp.url, comp.id)));
}

/**
 * Initializes the real-time simulation timer display.
 */
function initializeSimulationTimer() {
  const timeValueElement = document.querySelector('#simulation-time .value span');
  if (!timeValueElement) {
    console.warn("Simulation timer element not found (#simulation-time .value span). Skipping timer initialization.");
    return;
  }
  let startTime = Date.now();
  setInterval(() => {
    const elapsedTime = (Date.now() - startTime) / 1000;
    timeValueElement.textContent = elapsedTime.toFixed(1);
  }, 100);
}

/**
 * Initializes the main application logic, including panel controls and pagination.
 * This runs after all components are loaded.
 */
function initializeApp() {

  // 1. Initialize independent features
  initializeSimulationTimer();
  // Note: Scroll button control logic removed as mouse wheel scrolling is CSS-based.

  // --- 2. Secondary Panel Control Logic ---
  const openPanelButtons = document.querySelectorAll('.param-item[data-panel-target]');

  function openPanel(panel) {
    if (panel) panel.classList.add('visible');
  }

  function closePanel(panel) {
    if (panel) panel.classList.remove('visible');
  }

  // Attach listeners to open panels
  openPanelButtons.forEach(button => {
    button.addEventListener('click', () => {
      const panelId = button.dataset.panelTarget;
      if (!panelId) return;

      // Close any currently open panel before opening a new one
      document.querySelectorAll('.secondary-panel.visible').forEach(visiblePanel => {
        if (visiblePanel.id !== panelId) {
          closePanel(visiblePanel);
        }
      });

      const panel = document.getElementById(panelId);
      if (panel) {
        openPanel(panel);
      } else {
        console.error("Panel element not found in DOM:", panelId);
      }
    });
  });

  // Attach delegated listeners for close/save buttons (works for dynamically loaded content)
  document.addEventListener('click', (event) => {
    // Handle Close (X) or Cancel buttons within panels
    if (event.target.matches('.secondary-panel-close') || event.target.matches('.secondary-panel-footer .btn-cancel')) {
      const panel = event.target.closest('.secondary-panel');
      closePanel(panel);
    }

    // Handle Save/Apply buttons within panels
    if (event.target.matches('.secondary-panel-footer .btn-apply, .secondary-panel-footer .btn-save')) {
      console.log('数据已保存!'); // Placeholder action
      const panel = event.target.closest('.secondary-panel');
      closePanel(panel);
    }
  });

  // --- 3. Attitude Control Panel Specific Logic (Euler/Quaternion Toggle) ---
  // Must find elements *after* components are loaded
  const attTargetType = document.getElementById('att-target-type');
  if (attTargetType) {
    const eulerInputs = document.getElementById('euler-inputs');
    const quatInputs = document.getElementById('quaternion-inputs');

    if (eulerInputs && quatInputs) {
      attTargetType.addEventListener('change', (e) => {
        eulerInputs.style.display = (e.target.value === 'euler') ? 'block' : 'none';
        quatInputs.style.display = (e.target.value === 'quaternion') ? 'block' : 'none';
      });
      // Initial setup based on default selection
      eulerInputs.style.display = (attTargetType.value === 'euler') ? 'block' : 'none';
      quatInputs.style.display = (attTargetType.value === 'quaternion') ? 'block' : 'none';
    }
  }

  // --- 4. Result Output Area: Data Generation, Filtering, and Pagination ---
  const RECORDS_PER_PAGE = 10;
  let currentPage = 1;
  let allLinkData = [];
  let filteredLinkData = [];

  const linkListContainer = document.getElementById('link-list-container');
  const linkFilter = document.getElementById('link-filter');
  const prevPageBtn = document.getElementById('prev-page');
  const nextPageBtn = document.getElementById('next-page');
  const paginationNumbers = document.getElementById('pagination-numbers');
  const recordSummary = document.getElementById('record-summary');

  // Check if pagination elements exist before proceeding
  if (linkListContainer && linkFilter && prevPageBtn && nextPageBtn && paginationNumbers && recordSummary) {

    // 4.1 Generate random link data
    function generateLinkData() { /* ... (keep function as provided) ... */
      const data = [];
      const statuses = ['established', 'disconnected'];
      for (let i = 1; i <= 500; i++) {
        const status = statuses[Math.floor(Math.random() * 2)];
        const snr = (Math.random() * 20 + 5).toFixed(1);
        const ber = (Math.random() * 10 + 1).toFixed(1) + 'e-' + Math.floor(Math.random() * 5 + 8);
        const distance = Math.floor(Math.random() * 10000 + 1000);
        data.push({ id: i, name: `链路${i}`, status: status, snr: snr, ber: ber, distance: distance, reason: status === 'disconnected' ? '地球遮挡' : null });
      }
      return data;
    }

    // 4.2 Render link items for the current page
    function renderLinks(data, page) { /* ... (keep function as provided) ... */
      linkListContainer.innerHTML = '';
      const startIndex = (page - 1) * RECORDS_PER_PAGE;
      const endIndex = startIndex + RECORDS_PER_PAGE;
      const pageData = data.slice(startIndex, endIndex);
      pageData.forEach(link => {
        const isEstablished = link.status === 'established';
        const html = `<div class="link-status ${link.status}"><h3><span>${link.name}:</span><span class="status-text">${isEstablished ? '已建立' : '断开'}</span></h3><ul><li><strong>${isEstablished ? 'SNR:' : '原因:'}</strong> <span>${isEstablished ? link.snr + ' dB' : link.reason}</span></li>${isEstablished ? `<li><strong>BER:</strong> <span>${link.ber}</span></li><li><strong>距离:</strong> <span>${link.distance} km</span></li>` : ''}</ul></div>`;
        linkListContainer.insertAdjacentHTML('beforeend', html);
      });
    }

    // 4.3 Render pagination controls (page numbers, prev/next buttons)
    function renderPagination(totalRecords) { /* ... (keep function as provided) ... */
      paginationNumbers.innerHTML = '';
      const totalPages = Math.ceil(totalRecords / RECORDS_PER_PAGE);
      recordSummary.textContent = `总计: ${totalRecords} 条`;
      if (linkFilter.options.length > 0) linkFilter.options[0].textContent = `所有链路 (${allLinkData.length})`;

      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages, currentPage + 2);
      if (endPage - startPage < 4) { if (startPage > 1) startPage = Math.max(1, endPage - 4); else if (endPage < totalPages) endPage = Math.min(totalPages, startPage + 4); }

      if (totalPages > 5 && startPage > 1) paginationNumbers.insertAdjacentHTML('afterbegin', '<span class="ellipsis">...</span>');
      for (let i = startPage; i <= endPage; i++) { const btn = document.createElement('button'); btn.textContent = i; btn.classList.toggle('active', i === currentPage); btn.addEventListener('click', () => goToPage(i)); paginationNumbers.appendChild(btn); }
      if (totalPages > 5 && endPage < totalPages) paginationNumbers.insertAdjacentHTML('beforeend', '<span class="ellipsis">...</span>');

      prevPageBtn.disabled = currentPage === 1;
      nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    }

    // 4.4 Navigate to a specific page
    function goToPage(page) { /* ... (keep function as provided) ... */
      const totalPages = Math.ceil(filteredLinkData.length / RECORDS_PER_PAGE);
      if (page >= 1 && page <= totalPages) { currentPage = page; renderLinks(filteredLinkData, currentPage); renderPagination(filteredLinkData.length); }
    }

    // 4.5 Apply current filter and update display
    function applyFilterAndRender() { /* ... (keep function as provided) ... */
      const filterValue = linkFilter.value;
      filteredLinkData = (filterValue === 'all') ? allLinkData : allLinkData.filter(link => link.status === filterValue);
      const totalPages = Math.ceil(filteredLinkData.length / RECORDS_PER_PAGE);
      if (currentPage > totalPages && totalPages > 0) currentPage = totalPages; else if (totalPages === 0) currentPage = 0; else if (currentPage === 0 && totalPages > 0) currentPage = 1;
      goToPage(currentPage > 0 ? currentPage : 1);
    }

    // --- Initial Data Load and Render ---
    allLinkData = generateLinkData();
    applyFilterAndRender();

    // --- Attach Event Listeners for Pagination/Filtering ---
    linkFilter.addEventListener('change', () => { currentPage = 1; applyFilterAndRender(); });
    prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
    nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
  } else {
    console.warn("Pagination elements not found in HTML. Skipping pagination initialization.");
  }

  console.log("App initialization complete. All events bound.");
}

// --- Application Entry Point ---
document.addEventListener('DOMContentLoaded', () => {
  // 1. Load all HTML components asynchronously
  loadAllComponents().then(() => {
    // 2. Once components are loaded, initialize all JavaScript functionality
    initializeApp();
  });
});
