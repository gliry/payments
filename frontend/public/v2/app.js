    // ============================================
    // API CONFIG & MODE
    // ============================================
    var API_BASE = window.__OMNIFLOW_API_URL__
      || (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? 'http://localhost:3000'
        : 'https://omniflow.up.railway.app');
    var APP_MODE = localStorage.getItem('omniflow_mode') || 'demo'; // 'demo' | 'prod'
    var AUTH_TOKEN = localStorage.getItem('omniflow_token') || null;
    var CURRENT_USER = null;

    function isProd() { return APP_MODE === 'prod'; }

    // ---- API helpers ----
    async function api(method, path, body) {
      var headers = { 'Content-Type': 'application/json' };
      if (AUTH_TOKEN) headers['Authorization'] = 'Bearer ' + AUTH_TOKEN;
      var opts = { method: method, headers: headers };
      if (body) opts.body = JSON.stringify(body);
      var res = await fetch(API_BASE + '/v1/' + path, opts);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'API error ' + res.status);
      return data;
    }

    function apiGet(path) { return api('GET', path); }
    function apiPost(path, body) { return api('POST', path, body); }

    // ---- Mode toggle ----
    function toggleMode() {
      APP_MODE = APP_MODE === 'demo' ? 'prod' : 'demo';
      localStorage.setItem('omniflow_mode', APP_MODE);
      updateModeUI();
      // Reset auth state when switching modes
      if (APP_MODE === 'demo') {
        isAuthenticated = false;
        AUTH_TOKEN = null;
        CURRENT_USER = null;
        localStorage.removeItem('omniflow_token');
        document.getElementById('nav-connect').style.display = '';
        document.getElementById('nav-balance').style.display = '';
        document.getElementById('wallet-pill').style.display = 'none';
        document.getElementById('main').classList.remove('auth-active');
        document.getElementById('activity').style.display = '';
      } else {
        // In prod mode, check if we have a stored token
        if (AUTH_TOKEN) {
          restoreSession();
        } else {
          isAuthenticated = false;
          document.getElementById('nav-connect').style.display = '';
          document.getElementById('nav-balance').style.display = '';
          document.getElementById('wallet-pill').style.display = 'none';
          document.getElementById('main').classList.remove('auth-active');
          document.getElementById('activity').style.display = '';
        }
      }
      showToast(APP_MODE === 'prod' ? 'Switched to Prod mode' : 'Switched to Demo mode');
    }

    function updateModeUI() {
      var label = document.getElementById('mode-label');
      var track = document.getElementById('mode-track');
      if (APP_MODE === 'prod') {
        label.textContent = 'PROD';
        label.className = 'mode-toggle-label prod';
        track.classList.add('active');
        // Clear ALL hardcoded mock data in prod mode
        clearMockData();
      } else {
        label.textContent = 'DEMO';
        label.className = 'mode-toggle-label demo';
        track.classList.remove('active');
      }
    }

    function clearMockData() {
      var empty = '<div style="text-align:center;color:#c4b5fd;font-size:12px;padding:20px 0;">No activity yet</div>';

      // Dashboard
      var el = document.querySelector('#view-dashboard .balance-amount');
      if (el) el.textContent = '$0.00';
      el = document.querySelector('#view-dashboard .chain-chips');
      if (el) el.innerHTML = '';
      el = document.querySelector('#view-dashboard .activity-list');
      if (el) el.innerHTML = empty;

      // Home
      el = document.querySelector('#view-home .activity-list');
      if (el) el.innerHTML = empty;

      // Nav balance
      el = document.getElementById('nav-balance');
      if (el) el.textContent = '$0';

      // Payout — clear state and re-render
      el = document.querySelector('#payout-balance span');
      if (el) el.textContent = '$0';
      el = document.getElementById('payout-memo-input');
      if (el) el.value = '';
      el = document.getElementById('payout-result-total-amount');
      if (el) el.textContent = '';
      el = document.getElementById('payout-result-total-meta');
      if (el) el.textContent = '';
      if (typeof payoutState !== 'undefined') {
        payoutState.recipients = [];
        payoutState.memo = '';
        payoutState.balance = 0;
        if (typeof payoutRenderRecipients === 'function') payoutRenderRecipients();
        if (typeof payoutUpdateSummary === 'function') payoutUpdateSummary();
      }

      // Payin result
      el = document.getElementById('payin-result-amount');
      if (el) el.textContent = '';

      // Top Up
      el = document.querySelector('.source-wallet-address');
      if (el) el.textContent = '';
      el = document.getElementById('topup-conversion-label');
      if (el) el.textContent = '';
      el = document.querySelector('.destination-address');
      if (el) el.textContent = '';
      el = document.getElementById('topup-fee-amount');
      if (el) el.textContent = '';
      el = document.getElementById('topup-amount-input');
      if (el) el.value = '';
      el = document.getElementById('topup-balance-hint');
      if (el) el.textContent = '';

      // Payer modal
      el = document.getElementById('payer-step1-amount');
      if (el) el.textContent = '';
      el = document.getElementById('payer-step1-desc');
      if (el) el.textContent = '';
      el = document.getElementById('payer-preview-amount');
      if (el) el.textContent = '';
      el = document.getElementById('payer-preview-desc');
      if (el) el.textContent = '';
      el = document.getElementById('payer-pay-btn');
      if (el) el.textContent = 'Pay';
      el = document.getElementById('payer-success-amount');
      if (el) el.textContent = '';
      el = document.getElementById('payer-success-desc');
      if (el) el.textContent = '';
      el = document.getElementById('payer-success-from');
      if (el) el.textContent = '';
      el = document.getElementById('payer-success-tx');
      if (el) el.textContent = '';
    }

    async function restoreSession() {
      try {
        var user = await apiGet('auth/me');
        CURRENT_USER = user;
        isAuthenticated = true;
        applyAuthUI(user);
      } catch (e) {
        AUTH_TOKEN = null;
        CURRENT_USER = null;
        localStorage.removeItem('omniflow_token');
        isAuthenticated = false;
      }
    }

    function applyAuthUI(user) {
      document.getElementById('nav-connect').style.display = 'none';
      document.getElementById('wallet-pill').style.display = 'flex';
      if (user && user.smartAccountAddress) {
        var addr = user.smartAccountAddress;
        document.getElementById('wallet-pill').innerHTML =
          addr.slice(0, 6) + '...' + addr.slice(-4) +
          ' <span class="copy">&#x1f4cb;</span>';
      }
      document.getElementById('main').classList.add('auth-active');
      document.getElementById('activity').style.display = 'block';

      // Update balance in nav + dashboard + payout + settings if on that page
      if (isProd()) {
        loadProdDashboard();
        var currentHash = location.hash.slice(1) || 'home';
        if (currentHash === 'settings') loadSettingsPage();
      } else {
        document.getElementById('nav-balance').style.display = 'block';
      }
    }


    // Init mode UI on load
    window.addEventListener('DOMContentLoaded', function() {
      updateModeUI();
      if (isProd() && AUTH_TOKEN) {
        restoreSession();
      }
    });

    // ============================================
    // ICON MAP — all 10 SVG data URIs
    // ============================================
    const ICON_MAP = {
      "icons/tokens/eth.svg": "data:image/svg+xml,%3Csvg%20width%3D%22220%22%20height%3D%22220%22%20viewBox%3D%220%200%20220%20220%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cg%20clip-path%3D%22url(%23clip0_108_167)%22%3E%0A%3Cpath%20d%3D%22M110%20220C170.751%20220%20220%20170.751%20220%20110C220%2049.2487%20170.751%200%20110%200C49.2487%200%200%2049.2487%200%20110C0%20170.751%2049.2487%20220%20110%20220Z%22%20fill%3D%22%23627EEA%22%2F%3E%0A%3Cpath%20d%3D%22M113.424%2027.5V88.4813L164.966%20111.512L113.424%2027.5Z%22%20fill%3D%22white%22%20fill-opacity%3D%220.602%22%2F%3E%0A%3Cpath%20d%3D%22M113.424%2027.5L61.875%20111.512L113.424%2088.4813V27.5Z%22%20fill%3D%22white%22%2F%3E%0A%3Cpath%20d%3D%22M113.424%20151.031V192.467L165%20121.111L113.424%20151.031Z%22%20fill%3D%22white%22%20fill-opacity%3D%220.602%22%2F%3E%0A%3Cpath%20d%3D%22M113.424%20192.467V151.024L61.875%20121.111L113.424%20192.467Z%22%20fill%3D%22white%22%2F%3E%0A%3Cpath%20d%3D%22M113.424%20141.44L164.966%20111.513L113.424%2088.4956V141.44Z%22%20fill%3D%22white%22%20fill-opacity%3D%220.2%22%2F%3E%0A%3Cpath%20d%3D%22M61.875%20111.513L113.424%20141.44V88.4956L61.875%20111.513Z%22%20fill%3D%22white%22%20fill-opacity%3D%220.602%22%2F%3E%0A%3C%2Fg%3E%0A%3Cdefs%3E%0A%3CclipPath%20id%3D%22clip0_108_167%22%3E%0A%3Crect%20width%3D%22220%22%20height%3D%22220%22%20fill%3D%22white%22%2F%3E%0A%3C%2FclipPath%3E%0A%3C%2Fdefs%3E%0A%3C%2Fsvg%3E",
      "icons/tokens/usdc.svg": "data:image/svg+xml,%3Csvg%20width%3D%22220%22%20height%3D%22220%22%20viewBox%3D%220%200%20220%20220%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cg%20clip-path%3D%22url(%23clip0_108_15)%22%3E%0A%3Cpath%20d%3D%22M110%20220C131.756%20220%20153.023%20213.549%20171.113%20201.462C189.202%20189.375%20203.301%20172.195%20211.627%20152.095C219.952%20131.995%20222.131%20109.878%20217.886%2088.5401C213.642%2067.2022%20203.165%2047.6021%20187.782%2032.2183C172.398%2016.8345%20152.798%206.35804%20131.46%202.11367C110.122%20-2.13071%2088.0045%200.0476608%2067.9047%208.3733C47.8048%2016.6989%2030.6251%2030.7979%2018.5382%2048.8873C6.45123%2066.9767%20-0.000155252%2088.2441%20-0.000155252%20110C-0.035768%20124.455%202.78516%20138.775%208.30056%20152.137C13.816%20165.499%2021.9171%20177.64%2032.1387%20187.861C42.3602%20198.083%2054.5007%20206.184%2067.8626%20211.699C81.2245%20217.215%2095.5444%20220.036%20110%20220Z%22%20fill%3D%22%232775CA%22%2F%3E%0A%3Cpath%20d%3D%22M140.25%20127.42C140.25%20111.42%20130.63%20105.87%20111.38%20103.58C97.6199%20101.75%2094.8799%2098.0799%2094.8799%2091.6699C94.8799%2085.2599%2099.4599%2081.1199%20108.62%2081.1199C116.88%2081.1199%20121.46%2083.8699%20123.75%2090.7499C123.996%2091.4127%20124.439%2091.984%20125.021%2092.3865C125.602%2092.7889%20126.293%2093.003%20127%2092.9999H134.33C134.754%2093.0109%20135.177%2092.9354%20135.571%2092.7779C135.966%2092.6205%20136.324%2092.3845%20136.624%2092.0842C136.924%2091.7839%20137.16%2091.4256%20137.318%2091.0312C137.475%2090.6368%20137.551%2090.2144%20137.54%2089.7899V89.3399C136.654%2084.3722%20134.153%2079.8362%20130.424%2076.4365C126.695%2073.0369%20121.948%2070.964%20116.92%2070.5399V59.5399C116.92%2057.7099%20115.54%2056.3399%20113.25%2055.8799H106.37C104.54%2055.8799%20103.17%2057.2499%20102.71%2059.5399V70.1199C88.9199%2071.9999%2080.2099%2081.1199%2080.2099%2092.5799C80.2099%20107.71%2089.3799%20113.67%20108.63%20115.96C121.46%20118.25%20125.63%20120.96%20125.63%20128.33C125.63%20135.7%20119.22%20140.71%20110.51%20140.71C98.5899%20140.71%2094.5099%20135.71%2093.0899%20128.79C92.9589%20128.017%2092.5609%20127.314%2091.9652%20126.804C91.3695%20126.295%2090.6139%20126.01%2089.8299%20126H81.9999C81.5757%20125.99%2081.154%20126.067%2080.7602%20126.225C80.3664%20126.383%2080.0087%20126.619%2079.7087%20126.919C79.4087%20127.219%2079.1726%20127.576%2079.0147%20127.97C78.8568%20128.364%2078.7803%20128.786%2078.7899%20129.21V129.67C80.6299%20141.13%2087.9599%20149.38%20103.09%20151.67V162.67C103.09%20164.5%20104.46%20165.88%20106.75%20166.34H113.63C115.46%20166.34%20116.84%20164.96%20117.29%20162.67V151.67C131.04%20149.38%20140.21%20139.75%20140.21%20127.38L140.25%20127.42Z%22%20fill%3D%22white%22%2F%3E%0A%3Cpath%20d%3D%22M86.6199%20175.54C73.4321%20170.703%2062.0474%20161.933%2054.0047%20150.417C45.962%20138.9%2041.6492%20125.192%2041.6492%20111.145C41.6492%2097.0979%2045.962%2083.3896%2054.0047%2071.873C62.0474%2060.3565%2073.4321%2051.5869%2086.6199%2046.7498C87.4998%2046.3692%2088.2389%2045.7232%2088.7337%2044.902C89.2286%2044.0809%2089.4545%2043.1256%2089.3799%2042.1698V35.7498C89.4416%2034.9077%2089.196%2034.0717%2088.6885%2033.3969C88.181%2032.7221%2087.446%2032.2541%2086.6199%2032.0798C85.9747%2032.0125%2085.3265%2032.1754%2084.7899%2032.5398C68.104%2037.8433%2053.5386%2048.319%2043.202%2062.4505C32.8655%2076.5821%2027.2939%2093.6363%2027.2939%20111.145C27.2939%20128.653%2032.8655%20145.707%2043.202%20159.839C53.5386%20173.971%2068.104%20184.446%2084.7899%20189.75C85.1709%20189.971%2085.599%20190.099%2086.0391%20190.123C86.4792%20190.147%2086.9187%20190.067%2087.3216%20189.888C87.7245%20189.71%2088.0794%20189.438%2088.3572%20189.096C88.6351%20188.754%2088.8279%20188.351%2088.9199%20187.92C89.3799%20187.46%2089.3799%20187%2089.3799%20186.08V179.67C89.3799%20178.29%2087.9999%20176.46%2086.6199%20175.54ZM135.21%2032.5398C134.828%2032.3184%20134.399%2032.1907%20133.959%2032.1673C133.518%2032.1438%20133.078%2032.2252%20132.675%2032.4048C132.272%2032.5844%20131.917%2032.8571%20131.64%2033.2004C131.362%2033.5437%20131.171%2033.9479%20131.08%2034.3798C130.63%2034.8298%20130.63%2035.2898%20130.63%2036.2098V42.6198C130.707%2043.5441%20130.995%2044.4385%20131.472%2045.2341C131.949%2046.0298%20132.601%2046.7057%20133.38%2047.2098C146.568%2052.0469%20157.952%2060.8165%20165.995%2072.333C174.038%2083.8496%20178.351%2097.5579%20178.351%20111.605C178.351%20125.652%20174.038%20139.36%20165.995%20150.877C157.952%20162.393%20146.568%20171.163%20133.38%20176C132.501%20176.381%20131.763%20177.027%20131.27%20177.848C130.777%20178.67%20130.553%20179.625%20130.63%20180.58V187C130.568%20187.84%20130.812%20188.675%20131.317%20189.35C131.823%20190.024%20132.556%20190.493%20133.38%20190.67C134.025%20190.737%20134.673%20190.574%20135.21%20190.21C151.889%20184.833%20166.434%20174.304%20176.751%20160.139C187.068%20145.973%20192.626%20128.899%20192.626%20111.375C192.626%2093.8501%20187.068%2076.7769%20176.751%2062.6111C166.434%2048.4452%20151.889%2037.9167%20135.21%2032.5398Z%22%20fill%3D%22white%22%2F%3E%0A%3C%2Fg%3E%0A%3Cdefs%3E%0A%3CclipPath%20id%3D%22clip0_108_15%22%3E%0A%3Crect%20width%3D%22220%22%20height%3D%22220%22%20fill%3D%22white%22%2F%3E%0A%3C%2FclipPath%3E%0A%3C%2Fdefs%3E%0A%3C%2Fsvg%3E",
      "icons/tokens/usdt.svg": "data:image/svg+xml,%3Csvg%20width%3D%22220%22%20height%3D%22220%22%20viewBox%3D%220%200%20220%20220%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cg%20clip-path%3D%22url(%23clip0_108_407)%22%3E%0A%3Cpath%20d%3D%22M110%20220C170.751%20220%20220%20170.751%20220%20110C220%2049.2487%20170.751%200%20110%200C49.2487%200%200%2049.2487%200%20110C0%20170.751%2049.2487%20220%20110%20220Z%22%20fill%3D%22%2326A17B%22%2F%3E%0A%3Cpath%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%20d%3D%22M123.214%20119.51V119.497C122.458%20119.552%20118.56%20119.785%20109.863%20119.785C102.919%20119.785%2098.0311%20119.579%2096.3124%20119.497V119.517C69.5824%20118.342%2049.6311%20113.687%2049.6311%20108.118C49.6311%20102.557%2069.5824%2097.9022%2096.3124%2096.7059V114.883C98.0586%20115.007%20103.064%20115.303%20109.98%20115.303C118.278%20115.303%20122.437%20114.959%20123.214%20114.89V96.7197C149.889%2097.9091%20169.792%20102.563%20169.792%20108.118C169.792%20113.687%20149.889%20118.328%20123.214%20119.51ZM123.214%2094.8291V78.5628H160.435V53.7578H59.0911V78.5628H96.3124V94.8222C66.0624%2096.2109%2043.313%20102.206%2043.313%20109.383C43.313%20116.561%2066.0624%20122.549%2096.3124%20123.945V176.071H123.214V123.931C153.416%20122.542%20176.11%20116.554%20176.11%20109.383C176.11%20102.213%20153.416%2096.2247%20123.214%2094.8291Z%22%20fill%3D%22white%22%2F%3E%0A%3C%2Fg%3E%0A%3Cdefs%3E%0A%3CclipPath%20id%3D%22clip0_108_407%22%3E%0A%3Crect%20width%3D%22220%22%20height%3D%22220%22%20fill%3D%22white%22%2F%3E%0A%3C%2FclipPath%3E%0A%3C%2Fdefs%3E%0A%3C%2Fsvg%3E",
      "icons/tokens/wbtc.svg": "data:image/svg+xml,%3Csvg%20width%3D%22220%22%20height%3D%22220%22%20viewBox%3D%220%200%20220%20220%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cg%20clip-path%3D%22url(%23clip0_108_3)%22%3E%0A%3Cpath%20d%3D%22M220%20110C220%20131.756%20213.549%20153.023%20201.462%20171.113C189.375%20189.202%20172.195%20203.301%20152.095%20211.627C131.995%20219.952%20109.878%20222.131%2088.5401%20217.886C67.2022%20213.642%2047.6021%20203.166%2032.2183%20187.782C16.8345%20172.398%206.35804%20152.798%202.11367%20131.46C-2.13071%20110.122%200.0476608%2088.0047%208.3733%2067.9048C16.6989%2047.805%2030.7979%2030.6253%2048.8873%2018.5383C66.9767%206.45139%2088.2441%200%20110%200C139.174%200%20167.153%2011.5893%20187.782%2032.2183C208.411%2052.8473%20220%2080.8262%20220%20110Z%22%20fill%3D%22%23F7931A%22%2F%3E%0A%3Cpath%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%20d%3D%22M78.1801%2050.2304L103.46%2057.0004L109.11%2035.9404L121.75%2039.3704L116.32%2059.5604L126.63%2062.3304L132.07%2041.9204L144.93%2045.3604L139.39%2065.8804C139.39%2065.8804%20160.39%2070.5304%20165.33%2087.6104C170.27%20104.69%20154.47%20113.66%20149.59%20114C149.59%20114%20167.99%20124.09%20161.67%20143.94C155.35%20163.79%20135.95%20167.34%20115.54%20162.79L110%20184.07L97.1401%20180.63L102.79%20159.68L92.5901%20156.9L86.9401%20178L74.1801%20174.57L79.8401%20153.57L53.8901%20146.57L60.4301%20132.05C60.4301%20132.05%2067.7501%20134.05%2070.5201%20134.71C73.2901%20135.37%2075.0701%20132.49%2075.8501%20129.61C76.6301%20126.73%2088.3801%2079.0004%2089.4901%2075.0704C90.6001%2071.1404%2090.1501%2068.0704%2085.4901%2066.8604C80.8301%2065.6504%2074.4901%2063.7604%2074.4901%2063.7604L78.1801%2050.2304ZM103.68%20113.44L96.6801%20141.27C96.6801%20141.27%20131.39%20153.8%20135.83%20136.17C140.27%20118.54%20103.68%20113.44%20103.68%20113.44ZM106.9%20100.24L113.77%2074.7404C113.77%2074.7404%20143.49%2080.0604%20139.83%2094.2504C136.17%20108.44%20118.65%20103%20106.9%20100.24Z%22%20fill%3D%22white%22%2F%3E%0A%3C%2Fg%3E%0A%3Cdefs%3E%0A%3CclipPath%20id%3D%22clip0_108_3%22%3E%0A%3Crect%20width%3D%22220%22%20height%3D%22220%22%20fill%3D%22white%22%2F%3E%0A%3C%2FclipPath%3E%0A%3C%2Fdefs%3E%0A%3C%2Fsvg%3E",
      "icons/tokens/dai.svg": "data:image/svg+xml,%3Csvg%20width%3D%22220%22%20height%3D%22220%22%20viewBox%3D%220%200%20220%20220%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%22110%22%20cy%3D%22110%22%20r%3D%22110%22%20fill%3D%22%23F5AC37%22%2F%3E%3Cpath%20d%3D%22M139.4%2078.8H119.3C107.1%2078.8%2097.4%2086.6%2093.7%2097.6H85V105.4H91.5C91.4%20106.3%2091.3%20107.1%2091.3%20108V112H85V119.8H91.6C94.3%20131.8%20105.1%20140.8%20119.3%20140.8H139.4V128H119.3C112.1%20128%20105.9%20123.3%20103.3%20119.8H131V112H100.6C100.4%20110.7%20100.3%20109.4%20100.3%20108C100.3%20107.1%20100.3%20106.3%20100.4%20105.4H131V97.6H103.2C105.6%2093%20111.5%2091.5%20119.3%2091.5H139.4V78.8Z%22%20fill%3D%22white%22%2F%3E%3C%2Fsvg%3E",
      "icons/chains/base.svg": "data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cg%20clip-path%3D%22url(%23clip0_195_1728)%22%3E%0A%3Cpath%20d%3D%22M30%2060C46.5685%2060%2060%2046.5685%2060%2030C60%2013.4315%2046.5685%200%2030%200C13.4315%200%200%2013.4315%200%2030C0%2046.5685%2013.4315%2060%2030%2060Z%22%20fill%3D%22%230052FF%22%2F%3E%0A%3Cpath%20d%3D%22M30.1327%2050.8476C41.7604%2050.8476%2051.1862%2041.4379%2051.1862%2029.8305C51.1862%2018.2232%2041.7604%208.8136%2030.1327%208.8136C19.1012%208.8136%2010.0513%2017.2833%209.15247%2028.0639H36.9805V31.5972H9.15247C10.0513%2042.3777%2019.1012%2050.8476%2030.1327%2050.8476Z%22%20fill%3D%22white%22%2F%3E%0A%3C%2Fg%3E%0A%3Cdefs%3E%0A%3CclipPath%20id%3D%22clip0_195_1728%22%3E%0A%3Crect%20width%3D%2260%22%20height%3D%2260%22%20fill%3D%22white%22%2F%3E%0A%3C%2FclipPath%3E%0A%3C%2Fdefs%3E%0A%3C%2Fsvg%3E",
      "icons/chains/bnb.svg": "data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cpath%20d%3D%22M14.3009%209.19025L30.0893%200L45.8777%209.19025L40.0731%2012.5854L30.0893%206.79025L20.1054%2012.5854L14.3009%209.19025ZM45.8777%2020.7805L40.0731%2017.3854L30.0893%2023.1805L20.1054%2017.3854L14.3009%2020.7805V27.5708L24.2847%2033.3659V44.9561L30.0893%2048.3512L35.8939%2044.9561V33.3659L45.8777%2027.5708V20.7805ZM45.8777%2039.161V32.3708L40.0731%2035.7659V42.5561L45.8777%2039.161ZM49.999%2041.561L40.0152%2047.3561V54.1463L55.8036%2044.9561V26.5756L49.999%2029.9708V41.561ZM44.1944%2014.9854L49.999%2018.3805V25.1708L55.8036%2021.7756V14.9854L49.999%2011.5902L44.1944%2014.9854ZM24.2847%2049.8146V56.6049L30.0893%2060L35.8939%2056.6049V49.8146L30.0893%2053.2097L24.2847%2049.8146ZM14.3009%2039.161L20.1054%2042.5561V35.7659L14.3009%2032.3708V39.161ZM24.2847%2014.9854L30.0893%2018.3805L35.8939%2014.9854L30.0893%2011.5902L24.2847%2014.9854ZM10.1796%2018.3805L15.9841%2014.9854L10.1796%2011.5902L4.375%2014.9854V21.7756L10.1796%2025.1708V18.3805ZM10.1796%2029.9708L4.375%2026.5756V44.9561L20.1634%2054.1463V47.3561L10.1796%2041.561V29.9708Z%22%20fill%3D%22%23F0B90B%22%2F%3E%0A%3C%2Fsvg%3E",
      "icons/chains/optimism.svg": "data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cg%20clip-path%3D%22url(%23clip0_198_3655)%22%3E%0A%3Cpath%20d%3D%22M30%2060C46.5685%2060%2060%2046.5685%2060%2030C60%2013.4315%2046.5685%200%2030%200C13.4315%200%200%2013.4315%200%2030C0%2046.5685%2013.4315%2060%2030%2060Z%22%20fill%3D%22white%22%2F%3E%0A%3Cpath%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%20d%3D%22M30%2060C46.5685%2060%2060%2046.5685%2060%2030C60%2013.4315%2046.5685%200%2030%200C13.4315%200%200%2013.4315%200%2030C0%2046.5685%2013.4315%2060%2030%2060ZM18.7092%2038.2404C19.53%2038.4988%2020.4192%2038.628%2021.3768%2038.628C23.5808%2038.628%2025.3364%2038.1188%2026.6436%2037.1004C27.9508%2036.0668%2028.8628%2034.5088%2029.3796%2032.4264C29.5316%2031.7728%2029.676%2031.1192%2029.8128%2030.4656C29.9648%2029.812%2030.094%2029.1508%2030.2004%2028.482C30.3828%2027.4484%2030.3524%2026.544%2030.1092%2025.7688C29.8812%2024.9936%2029.4784%2024.34%2028.9008%2023.808C28.3384%2023.276%2027.6468%2022.8808%2026.826%2022.6224C26.0204%2022.3488%2025.1388%2022.212%2024.1812%2022.212C21.962%2022.212%2020.1988%2022.744%2018.8916%2023.808C17.5844%2024.872%2016.68%2026.43%2016.1784%2028.482C16.0264%2029.1508%2015.8744%2029.812%2015.7224%2030.4656C15.5856%2031.1192%2015.4564%2031.7728%2015.3348%2032.4264C15.1676%2033.46%2015.198%2034.3644%2015.426%2035.1396C15.6692%2035.9148%2016.072%2036.5608%2016.6344%2037.0776C17.1968%2037.5944%2017.8884%2037.982%2018.7092%2038.2404ZM23.8392%2034.6152C23.216%2035.1016%2022.494%2035.3448%2021.6732%2035.3448C20.8372%2035.3448%2020.2368%2035.1016%2019.872%2034.6152C19.5072%2034.1288%2019.416%2033.3536%2019.5984%2032.2896C19.72%2031.6208%2019.8416%2030.99%2019.9632%2030.3972C20.1%2029.8044%2020.252%2029.1888%2020.4192%2028.5504C20.6776%2027.4864%2021.1108%2026.7112%2021.7188%2026.2248C22.342%2025.7384%2023.064%2025.4952%2023.8848%2025.4952C24.7056%2025.4952%2025.306%2025.7384%2025.686%2026.2248C26.066%2026.7112%2026.1572%2027.4864%2025.9596%2028.5504C25.8532%2029.1888%2025.7316%2029.8044%2025.5948%2030.3972C25.4732%2030.99%2025.3288%2031.6208%2025.1616%2032.2896C24.9032%2033.3536%2024.4624%2034.1288%2023.8392%2034.6152ZM30.7685%2038.2404C30.8597%2038.3468%2030.9812%2038.4%2031.1333%2038.4H34.2341C34.4012%2038.4%2034.5456%2038.3468%2034.6673%2038.2404C34.8041%2038.134%2034.8876%2037.9972%2034.9181%2037.83L35.9669%2032.8368H39.0449C41.0057%2032.8368%2042.5636%2032.4188%2043.7189%2031.5828C44.8892%2030.7468%2045.6644%2029.4548%2046.0445%2027.7068C46.2269%2026.8252%2046.2192%2026.0576%2046.0217%2025.404C45.824%2024.7352%2045.4745%2024.1804%2044.9729%2023.7396C44.4713%2023.2988%2043.8404%2022.972%2043.0805%2022.7592C42.3356%2022.5464%2041.4996%2022.44%2040.5725%2022.44H34.5077C34.3556%2022.44%2034.2113%2022.4932%2034.0745%2022.5996C33.9377%2022.706%2033.854%2022.8428%2033.8237%2023.01L30.6773%2037.83C30.6468%2037.9972%2030.6773%2038.134%2030.7685%2038.2404ZM39.1817%2029.6904H36.5597L37.4489%2025.6092H40.1849C40.7321%2025.6092%2041.1348%2025.7004%2041.3933%2025.8828C41.6669%2026.0652%2041.8265%2026.3084%2041.8721%2026.6124C41.9177%2026.9164%2041.9024%2027.266%2041.8265%2027.6612C41.6744%2028.3452%2041.3477%2028.8544%2040.8461%2029.1888C40.3596%2029.5232%2039.8048%2029.6904%2039.1817%2029.6904Z%22%20fill%3D%22%23FF0420%22%2F%3E%0A%3C%2Fg%3E%0A%3Cdefs%3E%0A%3CclipPath%20id%3D%22clip0_198_3655%22%3E%0A%3Crect%20width%3D%2260%22%20height%3D%2260%22%20fill%3D%22white%22%2F%3E%0A%3C%2FclipPath%3E%0A%3C%2Fdefs%3E%0A%3C%2Fsvg%3E",
      "icons/chains/polygon.svg": "data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2255%22%20viewBox%3D%220%200%2060%2055%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cpath%20d%3D%22M22.4995%2018.4471L16.8749%2015.1915L0%2024.9577V44.4889L16.8749%2054.2552L33.7506%2044.4889V14.106L43.1249%208.68084L52.5006%2014.106V24.9577L43.1249%2030.3829L37.5003%2027.1283V35.8081L43.1249%2039.0638L60%2029.2975V9.76628L43.1249%200L26.2502%209.76628V40.1492L16.8749%2045.5744L7.50016%2040.1492V29.2975L16.8749%2023.8723L22.4995%2027.1269V18.4471Z%22%20fill%3D%22%236600FF%22%2F%3E%0A%3C%2Fsvg%3E",
      "icons/chains/arb.svg": "data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cg%20clip-path%3D%22url(%23clip0_195_1668)%22%3E%0A%3Cpath%20d%3D%22M29.7116%203.72457C29.8586%203.72457%2029.9942%203.76169%2030.1298%203.8345L52.1332%2016.6314C52.3916%2016.7784%2052.5515%2017.0497%2052.5386%2017.3437L52.453%2042.8019C52.453%2043.0974%2052.2931%2043.3672%2052.0347%2043.5142L29.9571%2056.1626C29.8343%2056.2369%2029.6873%2056.2726%2029.5388%2056.2726C29.3903%2056.2726%2029.2562%2056.2355%2029.1205%2056.1626L7.11858%2043.3672C6.86019%2043.2202%206.7003%2042.9489%206.71315%2042.6548L6.79881%2017.1967C6.79881%2016.9012%206.95869%2016.6314%207.21709%2016.4843L29.3061%203.82307C29.4289%203.76169%2029.5759%203.72457%2029.7116%203.72457ZM29.7244%200C28.9378%200%2028.1512%200.197007%2027.4503%200.602441L5.37265%2013.2508C3.95934%2014.0631%203.08566%2015.5621%203.08566%2017.1853L3%2042.6434C3%2044.2666%203.86083%2045.7655%205.2613%2046.5893L27.2647%2059.3861C27.9656%2059.7916%2028.7522%2060.0014%2029.5388%2060.0014C30.3254%2060.0014%2031.112%2059.8044%2031.813%2059.399L53.8906%2046.7506C55.3039%2045.9397%2056.1776%2044.4393%2056.1776%2042.8176L56.2632%2017.3594C56.2632%2015.7363%2055.4024%2014.2373%2054.0019%2013.4136L31.9985%200.615289C31.2976%200.209855%2030.511%200%2029.7244%200Z%22%20fill%3D%22%231B4ADD%22%2F%3E%0A%3Cpath%20d%3D%22M34.1852%2013.8776H30.9646C30.7191%2013.8776%2030.5092%2014.0246%2030.4235%2014.2587L20.0493%2042.6905C19.975%2042.8747%2020.1235%2043.0717%2020.3191%2043.0717H23.5397C23.7853%2043.0717%2023.9951%2042.9247%2024.0808%2042.6905L34.455%2014.2587C34.5293%2014.0746%2034.3808%2013.8776%2034.1852%2013.8776ZM28.5434%2013.8776H25.3228C25.0772%2013.8776%2024.8674%2014.0246%2024.7817%2014.2587L14.4189%2042.6791C14.3446%2042.8633%2014.4931%2043.0603%2014.6887%2043.0603H17.9093C18.1549%2043.0603%2018.3647%2042.9132%2018.4504%2042.6791L28.8132%2014.2587C28.8875%2014.0746%2028.7518%2013.8776%2028.5434%2013.8776ZM32.7234%2024.8914C32.6377%2024.633%2032.268%2024.633%2032.1823%2024.8914L30.5106%2029.4882C30.4621%2029.611%2030.4621%2029.758%2030.5106%2029.8822L35.1817%2042.6791C35.2673%2042.9004%2035.4772%2043.0603%2035.7227%2043.0603H38.9434C39.1404%2043.0603%2039.2874%2042.8633%2039.2132%2042.6791L32.7234%2024.8914ZM44.8436%2042.6791L35.5386%2017.1596C35.4529%2016.9012%2035.0832%2016.9012%2034.9975%2017.1596L33.3258%2021.7564C33.2773%2021.8792%2033.2773%2022.0262%2033.3258%2022.1504L40.8121%2042.6791C40.8977%2042.9004%2041.1076%2043.0603%2041.3531%2043.0603H44.5738C44.7822%2043.0731%2044.9178%2042.8633%2044.8436%2042.6791Z%22%20fill%3D%22%231B4ADD%22%2F%3E%0A%3C%2Fg%3E%0A%3Cdefs%3E%0A%3CclipPath%20id%3D%22clip0_195_1668%22%3E%0A%3Crect%20width%3D%2260%22%20height%3D%2260%22%20fill%3D%22white%22%2F%3E%0A%3C%2FclipPath%3E%0A%3C%2Fdefs%3E%0A%3C%2Fsvg%3E",
      "icons/chains/avalanche.svg": "data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%2230%22%20fill%3D%22%23E84142%22%2F%3E%3Cpath%20d%3D%22M40.7%2041H35.9C35.1%2041%2034.5%2040.6%2034.1%2039.9L30.3%2032.5C30.1%2032.2%2029.9%2032.2%2029.7%2032.5L25.9%2039.9C25.5%2040.6%2024.9%2041%2024.1%2041H19.3C18.8%2041%2018.5%2040.7%2018.5%2040.3C18.5%2040.1%2018.6%2040%2018.7%2039.8L29.4%2019.6C29.6%2019.2%2030%2019%2030.4%2019C30.8%2019%2031.2%2019.2%2031.4%2019.6L41.3%2039.8C41.4%2040%2041.5%2040.1%2041.5%2040.3C41.5%2040.7%2041.2%2041%2040.7%2041Z%22%20fill%3D%22white%22%2F%3E%3C%2Fsvg%3E",
      "icons/chains/eth_chain.svg": "data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cg%20clip-path%3D%22url(%23clip0_197_3187)%22%3E%0A%3Cpath%20opacity%3D%220.6%22%20d%3D%22M29.993%2021.8877L11.5781%2030.2593L29.993%2041.1486L48.4146%2030.2593L29.993%2021.8877Z%22%20fill%3D%22black%22%2F%3E%0A%3Cpath%20opacity%3D%220.45%22%20d%3D%22M11.585%2030.2526L29.9998%2041.1418V-0.300049L11.585%2030.2526Z%22%20fill%3D%22black%22%2F%3E%0A%3Cpath%20opacity%3D%220.8%22%20d%3D%22M30%20-0.300049V41.1418L48.4148%2030.2526L30%20-0.300049Z%22%20fill%3D%22black%22%2F%3E%0A%3Cpath%20opacity%3D%220.45%22%20d%3D%22M11.5781%2033.7458L29.993%2059.6999V44.6283L11.5781%2033.7458Z%22%20fill%3D%22black%22%2F%3E%0A%3Cpath%20opacity%3D%220.8%22%20d%3D%22M29.9932%2044.6283V59.6999L48.4216%2033.7458L29.9932%2044.6283Z%22%20fill%3D%22black%22%2F%3E%0A%3C%2Fg%3E%0A%3Cdefs%3E%0A%3CclipPath%20id%3D%22clip0_197_3187%22%3E%0A%3Crect%20width%3D%2260%22%20height%3D%2260%22%20fill%3D%22white%22%2F%3E%0A%3C%2FclipPath%3E%0A%3C%2Fdefs%3E%0A%3C%2Fsvg%3E"
    };

    function resolveIcon(path) {
      return ICON_MAP[path] || path;
    }

    // ============================================
    // DASHBOARD ICONS INIT
    // ============================================
    function initDashboardIcons() {
      const iconAssignments = {
        'dash-chain-base': 'icons/chains/base.svg',
        'dash-chain-arb': 'icons/chains/arb.svg',
        'dash-chain-eth': 'icons/chains/eth_chain.svg',
        'dash-token-usdc': 'icons/tokens/usdc.svg'
      };
      for (const [id, path] of Object.entries(iconAssignments)) {
        const el = document.getElementById(id);
        if (el) el.src = resolveIcon(path);
      }
    }

    document.addEventListener('DOMContentLoaded', initDashboardIcons);

    // ============================================
    // SPA ROUTER
    // ============================================
    function navigateTo(view) {
      location.hash = view;
    }

    var _currentView = '';

    function handleRoute() {
      const hash = location.hash.slice(1) || 'home';
      const validViews = ['landing', 'home', 'dashboard', 'payin', 'payout', 'topup', 'history', 'settings'];
      const view = validViews.includes(hash) ? hash : 'home';

      // Cleanup previous view
      if (_currentView === 'landing' && view !== 'landing') {
        if (typeof landingCleanup === 'function') landingCleanup();
      }

      _currentView = view;

      // Toggle body class for landing
      document.body.classList.toggle('on-landing', view === 'landing');

      // Deactivate all views
      document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));

      // Activate target view
      const target = document.getElementById('view-' + view);
      if (target) {
        requestAnimationFrame(() => {
          target.classList.add('active');
        });
      }

      // Update nav active state
      document.querySelectorAll('.topnav .nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (view === 'home') {
          link.classList.remove('active');
        } else if (href === '#' + view) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });

      // Init landing view
      if (view === 'landing') {
        if (typeof landingInit === 'function') landingInit();
      }
    }

    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('DOMContentLoaded', handleRoute);

    // ============================================
    // AUTH MODAL
    // ============================================
    let isAuthenticated = false;
    let _authCallback = null;

    function openAuthModal(callback) {
      if (isAuthenticated) {
        if (callback) callback();
        return;
      }
      _authCallback = callback || null;
      document.getElementById('auth-modal').classList.add('active');
      document.getElementById('email-input').focus();
    }

    function closeAuthModal() {
      document.getElementById('auth-modal').classList.remove('active');
      _authCallback = null;
    }

    function authenticate() {
      if (isProd()) {
        authenticateProd();
        return;
      }
      // Demo mode — instant fake auth
      isAuthenticated = true;
      var cb = _authCallback;
      _authCallback = null;
      document.getElementById('auth-modal').classList.remove('active');

      // Switch to auth state
      document.getElementById('nav-connect').style.display = 'none';
      document.getElementById('nav-balance').style.display = 'block';
      document.getElementById('wallet-pill').style.display = 'flex';

      // Show activity + shift layout
      document.getElementById('main').classList.add('auth-active');
      document.getElementById('activity').style.display = 'block';

      // Continue the interrupted action
      if (cb) cb();
    }

    function authenticateRegister() {
      if (isProd()) {
        authenticateProdRegister();
        return;
      }
      // Demo mode — same as login
      authenticate();
    }

    async function authenticateProdRegister() {
      var emailInput = document.getElementById('email-input');
      var username = emailInput ? emailInput.value.trim() : '';
      if (!username) {
        showToast('Please enter your email');
        return;
      }
      try {
        await passkeyRegister(username);
      } catch (e) {
        showToast('Registration failed: ' + e.message);
        console.error('Register error:', e);
      }
    }

    async function authenticateProd() {
      var emailInput = document.getElementById('email-input');
      var username = emailInput ? emailInput.value.trim() : '';
      if (!username) {
        showToast('Please enter your email');
        return;
      }

      try {
        // 1. Get WebAuthn options from server
        var existsRes;
        try {
          // Try login first — if user exists, we do login flow
          existsRes = await apiPost('auth/passkey/options', { mode: 'login', username: username });
        } catch (e) {
          // User doesn't exist → register flow
          existsRes = null;
        }

        if (existsRes && existsRes.challenge) {
          // LOGIN flow
          await passkeyLogin(username, existsRes);
        } else {
          // REGISTER flow
          await passkeyRegister(username);
        }
      } catch (e) {
        showToast('Auth failed: ' + e.message);
        console.error('Auth error:', e);
      }
    }

    async function passkeyRegister(username) {
      // 1. Get registration options
      var options = await apiPost('auth/passkey/options', { mode: 'register', username: username });

      // 2. Create credential via WebAuthn
      var publicKeyOptions = {
        challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), function(c) { return c.charCodeAt(0); }),
        rp: { name: options.rp.name, id: options.rp.id },
        user: {
          id: Uint8Array.from(atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')), function(c) { return c.charCodeAt(0); }),
          name: options.user.name,
          displayName: options.user.displayName
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout || 60000,
        attestation: options.attestation || 'none',
        authenticatorSelection: options.authenticatorSelection
      };
      if (options.excludeCredentials) {
        publicKeyOptions.excludeCredentials = options.excludeCredentials.map(function(c) {
          return { type: c.type, id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), function(ch) { return ch.charCodeAt(0); }) };
        });
      }

      var credential = await navigator.credentials.create({ publicKey: publicKeyOptions });

      // 3. Encode response
      var credentialData = {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: bufferToBase64url(credential.response.attestationObject),
          clientDataJSON: bufferToBase64url(credential.response.clientDataJSON)
        }
      };
      if (credential.authenticatorAttachment) {
        credentialData.authenticatorAttachment = credential.authenticatorAttachment;
      }

      // 4. Extract public key from attestation for Circle MSCA
      var publicKeyBytes = extractPublicKeyFromAttestation(credential.response);
      var publicKeyHex = '0x' + Array.from(new Uint8Array(publicKeyBytes)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');

      // 5. Register with backend
      var result = await apiPost('auth/register', {
        username: username,
        credential: credentialData,
        publicKey: publicKeyHex
      });

      AUTH_TOKEN = result.accessToken || result.token;
      localStorage.setItem('omniflow_token', AUTH_TOKEN);
      CURRENT_USER = result.user || result;
      isAuthenticated = true;

      document.getElementById('auth-modal').classList.remove('active');
      applyAuthUI(CURRENT_USER);
      showToast('Registered successfully!');

      var cb = _authCallback;
      _authCallback = null;
      if (cb) cb();
    }

    async function passkeyLogin(username, options) {
      // 1. Build assertion request
      var publicKeyOptions = {
        challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), function(c) { return c.charCodeAt(0); }),
        rpId: options.rpId,
        timeout: options.timeout || 60000,
        userVerification: options.userVerification || 'preferred'
      };
      if (options.allowCredentials && options.allowCredentials.length > 0) {
        publicKeyOptions.allowCredentials = options.allowCredentials.map(function(c) {
          return { type: c.type || 'public-key', id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), function(ch) { return ch.charCodeAt(0); }) };
        });
      }

      var assertion = await navigator.credentials.get({ publicKey: publicKeyOptions });

      // 2. Encode response
      var credentialData = {
        id: assertion.id,
        rawId: bufferToBase64url(assertion.rawId),
        type: assertion.type,
        response: {
          authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
          clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
          signature: bufferToBase64url(assertion.response.signature)
        }
      };
      if (assertion.response.userHandle) {
        credentialData.response.userHandle = bufferToBase64url(assertion.response.userHandle);
      }
      if (assertion.authenticatorAttachment) {
        credentialData.authenticatorAttachment = assertion.authenticatorAttachment;
      }

      // 3. Login with backend
      var result = await apiPost('auth/login', {
        username: username,
        credential: credentialData
      });

      AUTH_TOKEN = result.accessToken || result.token;
      localStorage.setItem('omniflow_token', AUTH_TOKEN);
      CURRENT_USER = result.user || result;
      isAuthenticated = true;

      document.getElementById('auth-modal').classList.remove('active');
      applyAuthUI(CURRENT_USER);
      showToast('Logged in successfully!');

      var cb = _authCallback;
      _authCallback = null;
      if (cb) cb();
    }

    // ---- WebAuthn utility functions ----
    function bufferToBase64url(buffer) {
      var bytes = new Uint8Array(buffer);
      var str = '';
      for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
      return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    function extractPublicKeyFromAttestation(response) {
      if (!response.getPublicKey) return new Uint8Array(0);
      var spkiBytes = new Uint8Array(response.getPublicKey());
      // SPKI for P-256 has 26-byte header, then 65-byte uncompressed point (04 + x + y)
      // Header: 3059301306072a8648ce3d020106082a8648ce3d03010703420004
      if (spkiBytes.length === 91) {
        return spkiBytes.slice(26); // raw uncompressed point: 04 + 32x + 32y = 65 bytes
      }
      return spkiBytes;
    }

    // Close modal on overlay click
    document.getElementById('auth-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeAuthModal();
    });

    // Close modal + dropdowns on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAuthModal();
        if (typeof topupCloseAllDropdowns === 'function') topupCloseAllDropdowns();
        if (typeof payinCloseAllDropdowns === 'function') payinCloseAllDropdowns();
      }
    });

    // ============================================
    // CARD MOUSE-TRACKING SPOTLIGHT
    // ============================================
    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', (e.clientX - rect.left) + 'px');
        card.style.setProperty('--mouse-y', (e.clientY - rect.top) + 'px');
      });
    });

    // Card clicks navigate to SPA views
    document.querySelector('#view-home .card-payin').addEventListener('click', () => {
      navigateTo('payin');
    });
    document.querySelector('#view-home .card-payout').addEventListener('click', () => {
      navigateTo('payout');
    });

    // ============================================
    // TOP UP VIEW
    // ============================================
    const TOPUP_RATES = { USDC: 1, USDT: 1, DAI: 1 };
    const TOPUP_BALANCES = { USDC: '2,450', USDT: '1,200', DAI: '500' };

    const topupSelected = {
      chain: { value: 'Base', icon: 'icons/chains/base.svg' },
      token: { value: 'USDC', icon: 'icons/tokens/usdc.svg' }
    };

    // Initialize topup icons from ICON_MAP on load
    function topupInitIcons() {
      // Chain select icon
      const chainImg = document.getElementById('topup-chain-select-img');
      if (chainImg) chainImg.src = resolveIcon(topupSelected.chain.icon);

      // Token select icon
      const tokenImg = document.getElementById('topup-token-select-img');
      if (tokenImg) tokenImg.src = resolveIcon(topupSelected.token.icon);

      // Success chain icon
      const successChainIcon = document.getElementById('topup-success-chain-icon');
      if (successChainIcon) successChainIcon.src = resolveIcon(topupSelected.chain.icon);

      // Chain dropdown option icons
      document.querySelectorAll('.topup-chain-opt-img').forEach(img => {
        const iconPath = img.getAttribute('data-icon');
        if (iconPath) img.src = resolveIcon(iconPath);
      });

      // Token dropdown option icons
      document.querySelectorAll('.topup-token-opt-img').forEach(img => {
        const iconPath = img.getAttribute('data-icon');
        if (iconPath) img.src = resolveIcon(iconPath);
      });
    }

    // Connect external wallet (state toggle)
    function topupConnectWallet() {
      document.getElementById('topup-state-connect').style.display = 'none';
      document.getElementById('topup-state-form').style.display = 'block';
    }

    function topupDisconnectWallet() {
      document.getElementById('topup-state-form').style.display = 'none';
      document.getElementById('topup-state-connect').style.display = 'block';
    }

    // Dropdown logic
    function topupToggleDropdown(type) {
      const select = document.getElementById('topup-' + type + '-select');
      const menu = document.getElementById('topup-' + type + '-dropdown');
      const isOpen = menu.classList.contains('open');

      topupCloseAllDropdowns();

      if (!isOpen) {
        select.classList.add('open');
        menu.classList.add('open');
      }
    }

    function topupCloseAllDropdowns() {
      document.querySelectorAll('#view-topup .dropdown-menu').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('#view-topup .form-select').forEach(s => s.classList.remove('open'));
    }

    // Close topup dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#view-topup .dropdown-wrapper')) {
        topupCloseAllDropdowns();
      }
    });

    // Chain selector
    function topupSelectChain(value, icon) {
      topupSelected.chain = { value, icon };
      const select = document.getElementById('topup-chain-select');
      select.innerHTML = '<img src="' + resolveIcon(icon) + '" alt="' + value + '"> ' + value + ' <span class="chevron">&#9660;</span>';
      document.querySelectorAll('#topup-chain-dropdown .dropdown-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });
      // Update destination label
      document.getElementById('topup-destination-label').textContent = 'Your OmniFlow on ' + value;
      topupCloseAllDropdowns();
    }

    // Token selector
    function topupSelectToken(value, icon) {
      topupSelected.token = { value, icon };
      const select = document.getElementById('topup-token-select');
      select.innerHTML = '<img src="' + resolveIcon(icon) + '" alt="' + value + '"> ' + value + ' <span class="chevron">&#9660;</span>';
      document.querySelectorAll('#topup-token-dropdown .dropdown-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });
      // Update balance hint
      document.getElementById('topup-balance-hint').textContent = 'Balance: ' + (TOPUP_BALANCES[value] || '0') + ' ' + value;
      topupUpdateConversion();
      topupCloseAllDropdowns();
    }

    // Update conversion label
    function topupUpdateConversion() {
      const amount = parseFloat(document.getElementById('topup-amount-input').value) || 0;
      const label = document.getElementById('topup-conversion-label');
      const token = topupSelected.token.value;
      const rate = TOPUP_RATES[token] || 1;

      if (amount === 0) {
        label.textContent = '';
        return;
      }

      const usdAmount = amount * rate;
      label.textContent = '\u2248 $' + usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Handle top up
    function topupHandleTopUp() {
      if (!isAuthenticated) {
        openAuthModal(function() { topupShowSuccess(); });
        return;
      }
      topupShowSuccess();
    }

    function topupShowSuccess() {
      const amount = document.getElementById('topup-amount-input').value || '0';
      const token = topupSelected.token.value;
      const decimals = (token === 'ETH' || token === 'WBTC') ? 6 : 2;

      document.getElementById('topup-success-amount').textContent =
        parseFloat(amount).toFixed(decimals) + ' ' + token;
      document.getElementById('topup-success-chain-icon').src = resolveIcon(topupSelected.chain.icon);
      document.getElementById('topup-success-chain-icon').alt = topupSelected.chain.value;
      document.getElementById('topup-success-chain-text').textContent = 'via ' + topupSelected.chain.value;

      document.getElementById('topup-card').style.display = 'none';
      document.getElementById('topup-success-card').style.display = 'block';
    }

    function topupShowForm() {
      document.getElementById('topup-success-card').style.display = 'none';
      document.getElementById('topup-card').style.display = 'block';
    }

    // Init topup icons and conversion on DOMContentLoaded
    window.addEventListener('DOMContentLoaded', () => {
      topupInitIcons();
      topupUpdateConversion();
    });

    // ============================================
    // PAY IN VIEW
    // ============================================
    const PAYIN_RATES = { USDC: 1, USDT: 1, DAI: 1 };

    const payinSelected = {
      denomination: { type: 'crypto', value: 'USDC', icon: 'icons/tokens/usdc.svg', symbol: 'USDC' },
      chain: { value: 'Base', icon: 'icons/chains/base.svg' },
      receiveToken: { value: 'USDC', icon: 'icons/tokens/usdc.svg' }
    };

    // Initialize payin icons from ICON_MAP on load
    function payinInitIcons() {
      // Denomination select icon
      const denomImg = document.getElementById('payin-denom-select-img');
      if (denomImg) denomImg.src = resolveIcon(payinSelected.denomination.icon);

      // Chain select icon
      const chainImg = document.getElementById('payin-chain-select-img');
      if (chainImg) chainImg.src = resolveIcon(payinSelected.chain.icon);

      // Token select icon
      const tokenImg = document.getElementById('payin-token-select-img');
      if (tokenImg) tokenImg.src = resolveIcon(payinSelected.receiveToken.icon);

      // Result token icon
      const resultTokenIcon = document.getElementById('payin-result-token-icon');
      if (resultTokenIcon) resultTokenIcon.src = resolveIcon(payinSelected.receiveToken.icon);

      // Denomination dropdown option icons (crypto only)
      document.querySelectorAll('.payin-denom-opt-img').forEach(function(img) {
        var iconPath = img.getAttribute('data-icon');
        if (iconPath) img.src = resolveIcon(iconPath);
      });

      // Chain dropdown option icons
      document.querySelectorAll('.payin-chain-opt-img').forEach(function(img) {
        var iconPath = img.getAttribute('data-icon');
        if (iconPath) img.src = resolveIcon(iconPath);
      });

      // Token dropdown option icons
      document.querySelectorAll('.payin-token-opt-img').forEach(function(img) {
        var iconPath = img.getAttribute('data-icon');
        if (iconPath) img.src = resolveIcon(iconPath);
      });
    }

    // Dropdown logic
    function payinToggleDropdown(type) {
      var select = document.getElementById('payin-' + type + '-select');
      var menu = document.getElementById('payin-' + type + '-dropdown');
      var isOpen = menu.classList.contains('open');

      payinCloseAllDropdowns();

      if (!isOpen) {
        select.classList.add('open');
        menu.classList.add('open');
      }
    }

    function payinCloseAllDropdowns() {
      document.querySelectorAll('#view-payin .dropdown-menu').forEach(function(m) { m.classList.remove('open'); });
      document.querySelectorAll('#view-payin .form-select').forEach(function(s) { s.classList.remove('open'); });
    }

    // Close payin dropdowns on outside click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#view-payin .dropdown-wrapper')) {
        payinCloseAllDropdowns();
      }
    });

    // Unified denomination selector (fiat + crypto in one dropdown)
    function payinSelectDenomination(type, value, icon, symbol) {
      payinSelected.denomination = { type: type, value: value, icon: icon, symbol: symbol };

      // Rebuild trigger button
      var select = document.getElementById('payin-denomination-select');
      var iconHtml = icon
        ? '<img src="' + resolveIcon(icon) + '" alt="' + value + '">'
        : '<span class="denom-text-icon">' + symbol + '</span>';
      select.innerHTML = iconHtml + ' ' + value + ' <span class="chevron">&#9660;</span>';

      // Mark selected in menu
      document.querySelectorAll('#payin-denomination-dropdown .dropdown-option').forEach(function(opt) {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });

      payinUpdateReceiveAsRow();
      payinUpdateConversionLabel();
      payinCloseAllDropdowns();
    }

    // Chain selector
    function payinSelectChain(value, icon) {
      payinSelected.chain = { value: value, icon: icon };
      var select = document.getElementById('payin-chain-select');
      select.innerHTML = '<img src="' + resolveIcon(icon) + '" alt="' + value + '"> ' + value + ' <span class="chevron">&#9660;</span>';
      document.querySelectorAll('#payin-chain-dropdown .dropdown-option').forEach(function(opt) {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });
      payinCloseAllDropdowns();
    }

    // Receive token selector (only shown in fiat mode)
    function payinSelectReceiveToken(value, icon) {
      payinSelected.receiveToken = { value: value, icon: icon };
      var select = document.getElementById('payin-token-select');
      select.innerHTML = '<img src="' + resolveIcon(icon) + '" alt="' + value + '"> ' + value + ' <span class="chevron">&#9660;</span>';
      document.querySelectorAll('#payin-token-dropdown .dropdown-option').forEach(function(opt) {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });
      payinUpdateConversionLabel();
      payinCloseAllDropdowns();
    }

    // Show/hide token selector based on denomination type
    function payinUpdateReceiveAsRow() {
      var isFiat = payinSelected.denomination.type === 'fiat';
      document.getElementById('payin-token-wrapper').style.display = isFiat ? '' : 'none';
    }

    // Update conversion label
    function payinUpdateConversionLabel() {
      var amount = parseFloat(document.getElementById('payin-amount-input').value) || 0;
      var label = document.getElementById('payin-conversion-label');
      var isFiat = payinSelected.denomination.type === 'fiat';
      var denom = payinSelected.denomination.value;

      if (amount === 0) {
        label.textContent = '';
        return;
      }

      if (isFiat) {
        var fiatRate = PAYIN_RATES[denom] || 1;
        var tokenRate = PAYIN_RATES[payinSelected.receiveToken.value] || 1;
        var cryptoAmount = (amount * fiatRate / tokenRate).toFixed(2);
        label.textContent = '\u2248 ' + cryptoAmount + ' ' + payinSelected.receiveToken.value;
      } else {
        var rate = PAYIN_RATES[denom] || 1;
        var usdAmount = amount * rate;
        label.textContent = '\u2248 $' + usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }

    // Generate link
    function payinHandleGenerate() {
      if (!isAuthenticated) {
        openAuthModal(function() { payinHandleGenerate(); });
        return;
      }
      if (isProd()) {
        payinCreateProdPayment();
      } else {
        payinShowResult();
      }
    }

    var _lastPaymentId = null;

    async function payinCreateProdPayment() {
      var amount = document.getElementById('payin-amount-input').value || '0';
      var desc = document.getElementById('payin-desc-input').value;
      var isFiat = payinSelected.denomination.type === 'fiat';
      var token = isFiat ? payinSelected.receiveToken.value : payinSelected.denomination.value;
      var chain = payinSelected.chain.value.toLowerCase();

      try {
        var payment = await apiPost('payments', {
          amount: amount,
          token: token,
          chain: chain,
          description: desc || undefined
        });
        _lastPaymentId = payment.id;

        // Show result with real data
        if (isFiat) {
          document.getElementById('payin-result-amount').textContent =
            payinSelected.denomination.symbol + parseFloat(amount).toFixed(2);
          document.getElementById('payin-result-token-icon').src = resolveIcon(payinSelected.receiveToken.icon);
          document.getElementById('payin-result-token-icon').alt = token;
          document.getElementById('payin-result-token-text').textContent =
            token + ' on ' + payinSelected.chain.value;
        } else {
          var decimals = (token === 'ETH' || token === 'WBTC') ? 6 : 2;
          document.getElementById('payin-result-amount').textContent =
            parseFloat(amount).toFixed(decimals) + ' ' + token;
          document.getElementById('payin-result-token-icon').src = resolveIcon(payinSelected.denomination.icon);
          document.getElementById('payin-result-token-icon').alt = token;
          document.getElementById('payin-result-token-text').textContent =
            token + ' on ' + payinSelected.chain.value;
        }
        document.getElementById('payin-result-desc').textContent = desc || '';

        // QR with real checkout URL
        var checkoutUrl = payment.checkoutUrl || (window.location.origin + '/pay.html?id=' + payment.id);
        var qr = qrcode(0, 'M');
        qr.addData(checkoutUrl);
        qr.make();
        document.getElementById('payin-qr-container').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });

        // Show settlement warning if module not configured
        var warningEl = document.getElementById('payin-settlement-warning');
        if (payment.warning) {
          if (!warningEl) {
            warningEl = document.createElement('div');
            warningEl.id = 'payin-settlement-warning';
            warningEl.style.cssText = 'background:#fef3c7;color:#92400e;font-size:11px;padding:10px 12px;border-radius:8px;margin-top:12px;text-align:left;line-height:1.4;';
            document.getElementById('payin-invoice-result').appendChild(warningEl);
          }
          warningEl.textContent = '⚠ ' + payment.warning;
          warningEl.style.display = 'block';
        } else if (warningEl) {
          warningEl.style.display = 'none';
        }

        document.getElementById('payin-invoice-form').style.display = 'none';
        document.getElementById('payin-invoice-result').style.display = 'block';
      } catch (e) {
        showToast('Failed to create payment: ' + e.message);
      }
    }

    function payinShowResult() {
      var amount = document.getElementById('payin-amount-input').value || '0';
      var desc = document.getElementById('payin-desc-input').value;
      var isFiat = payinSelected.denomination.type === 'fiat';

      if (isFiat) {
        document.getElementById('payin-result-amount').textContent =
          payinSelected.denomination.symbol + parseFloat(amount).toFixed(2);
        document.getElementById('payin-result-token-icon').src = resolveIcon(payinSelected.receiveToken.icon);
        document.getElementById('payin-result-token-icon').alt = payinSelected.receiveToken.value;
        document.getElementById('payin-result-token-text').textContent =
          payinSelected.receiveToken.value + ' on ' + payinSelected.chain.value;
      } else {
        var decimals = (payinSelected.denomination.value === 'ETH' || payinSelected.denomination.value === 'WBTC') ? 6 : 2;
        document.getElementById('payin-result-amount').textContent =
          parseFloat(amount).toFixed(decimals) + ' ' + payinSelected.denomination.value;
        document.getElementById('payin-result-token-icon').src = resolveIcon(payinSelected.denomination.icon);
        document.getElementById('payin-result-token-icon').alt = payinSelected.denomination.value;
        document.getElementById('payin-result-token-text').textContent =
          payinSelected.denomination.value + ' on ' + payinSelected.chain.value;
      }

      document.getElementById('payin-result-desc').textContent = desc || '';

      // Generate QR code
      var qr = qrcode(0, 'M');
      qr.addData('https://pay.omniflow.xyz/inv/a8f3k2');
      qr.make();
      document.getElementById('payin-qr-container').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });

      document.getElementById('payin-invoice-form').style.display = 'none';
      document.getElementById('payin-invoice-result').style.display = 'block';
    }

    function payinShowForm() {
      document.getElementById('payin-invoice-result').style.display = 'none';
      document.getElementById('payin-invoice-form').style.display = 'block';
    }

    function payinCopyLink() {
      var url = (isProd() && _lastPaymentId)
        ? (window.location.origin + '/pay.html?id=' + _lastPaymentId)
        : 'https://pay.omniflow.xyz/inv/a8f3k2';
      navigator.clipboard.writeText(url);
      var btn = document.getElementById('payin-btn-copy');
      var origHTML = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
      setTimeout(function() { btn.innerHTML = origHTML; }, 2000);
    }

    var payerPreviewOriginalUsd = 0;
    var payerPreviewChain = '';
    var payerPreviewToken = 'USDC';
    var payerPreviewDesc = '';
    var PAYER_TOKENS = ['USDC', 'USDT', 'DAI'];
    var PAYER_TOKEN_ICONS = {
      USDC: 'icons/tokens/usdc.svg',
      USDT: 'icons/tokens/usdt.svg',
      DAI: 'icons/tokens/dai.svg'
    };
    var PAYER_CHAINS = [
      { name: 'Base', icon: 'icons/chains/base.svg' },
      { name: 'Ethereum', icon: 'icons/chains/eth_chain.svg' },
      { name: 'Arbitrum', icon: 'icons/chains/arb.svg' },
      { name: 'Optimism', icon: 'icons/chains/optimism.svg' },
      { name: 'Polygon', icon: 'icons/chains/polygon.svg' },
      { name: 'BNB Chain', icon: 'icons/chains/bnb.svg' }
    ];

    function openPayerPreview() {
      var amountText = document.getElementById('payin-result-amount').textContent;
      var desc = document.getElementById('payin-result-desc').textContent;
      var tokenText = document.getElementById('payin-result-token-text').textContent;

      var parts = tokenText.split(' on ');
      var currentToken = parts[0] || 'USDC';
      payerPreviewChain = parts[1] || 'Base';
      payerPreviewToken = currentToken;
      payerPreviewDesc = desc || '';

      var numStr = amountText.replace(/[^0-9.]/g, '');
      var num = parseFloat(numStr) || 0;
      var rate = PAYIN_RATES[currentToken] || 1;
      payerPreviewOriginalUsd = num * rate;

      // Populate step 1
      var isStable = (currentToken === 'USDC' || currentToken === 'USDT');
      var step1Amount = isStable
        ? '$' + num.toFixed(2)
        : num.toFixed(6) + ' ' + currentToken;
      document.getElementById('payer-step1-amount').textContent = step1Amount;
      document.getElementById('payer-step1-desc').textContent = payerPreviewDesc;
      document.getElementById('payer-step1-desc').style.display = payerPreviewDesc ? 'block' : 'none';
      document.getElementById('payer-step1-token-icon').src = resolveIcon(PAYER_TOKEN_ICONS[currentToken]);
      document.getElementById('payer-step1-token-text').textContent = currentToken + ' on ' + payerPreviewChain;

      // Always reset to step 1
      document.getElementById('payer-step-1').classList.add('active');
      document.getElementById('payer-step-2').classList.remove('active');
      document.getElementById('payer-step-3').classList.remove('active');

      document.getElementById('payer-preview-modal').classList.add('active');
    }

    function payerConnectWallet() {
      // Hide step 1, show step 2
      document.getElementById('payer-step-1').classList.remove('active');
      document.getElementById('payer-step-2').classList.add('active');

      // Set description
      document.getElementById('payer-preview-desc').textContent = payerPreviewDesc;
      document.getElementById('payer-preview-desc').style.display = payerPreviewDesc ? 'block' : 'none';

      // Render chips
      renderPayerChainChips(payerPreviewChain);
      renderPayerTokenChips(payerPreviewToken);
      selectPayerToken(payerPreviewToken);
    }

    function renderPayerChainChips(activeChain) {
      var container = document.getElementById('payer-chain-chips');
      container.innerHTML = '';
      PAYER_CHAINS.forEach(function(chain) {
        var chip = document.createElement('div');
        chip.className = 'payer-chain-chip' + (chain.name === activeChain ? ' active' : '');
        chip.onclick = function() { selectPayerChain(chain.name); };
        chip.innerHTML = '<img src="' + resolveIcon(chain.icon) + '" alt="' + chain.name + '"> ' + chain.name;
        container.appendChild(chip);
      });
    }

    function selectPayerChain(name) {
      payerPreviewChain = name;
      var chips = document.querySelectorAll('.payer-chain-chip');
      chips.forEach(function(c) { c.classList.remove('active'); });
      chips.forEach(function(c) {
        if (c.textContent.trim() === name) c.classList.add('active');
      });
      updatePayerConversionInfo();
    }

    function renderPayerTokenChips(activeToken) {
      var container = document.getElementById('payer-token-chips');
      container.innerHTML = '';
      PAYER_TOKENS.forEach(function(token) {
        var chip = document.createElement('div');
        chip.className = 'payer-token-chip' + (token === activeToken ? ' active' : '');
        chip.onclick = function() { selectPayerToken(token); };
        chip.innerHTML = '<img src="' + resolveIcon(PAYER_TOKEN_ICONS[token]) + '" alt="' + token + '"> ' + token;
        container.appendChild(chip);
      });
    }

    function selectPayerToken(token) {
      payerPreviewToken = token;
      var chips = document.querySelectorAll('.payer-token-chip');
      chips.forEach(function(c) { c.classList.remove('active'); });
      chips.forEach(function(c) {
        if (c.textContent.trim() === token) c.classList.add('active');
      });

      var rate = PAYIN_RATES[token] || 1;
      var converted = payerPreviewOriginalUsd / rate;
      var isStable = (token === 'USDC' || token === 'USDT');
      var formatted = isStable
        ? '$' + converted.toFixed(2)
        : converted.toFixed(6) + ' ' + token;

      document.getElementById('payer-preview-amount').textContent = formatted;
      document.getElementById('payer-pay-btn').textContent = 'Pay ' + (isStable ? '$' + converted.toFixed(2) : converted.toFixed(6) + ' ' + token);
      updatePayerConversionInfo();
    }

    function updatePayerConversionInfo() {
      var rate = PAYIN_RATES[payerPreviewToken] || 1;
      var converted = payerPreviewOriginalUsd / rate;
      var isStable = (payerPreviewToken === 'USDC' || payerPreviewToken === 'USDT');
      var info = isStable
        ? '\u2248 ' + converted.toFixed(2) + ' ' + payerPreviewToken + ' on ' + payerPreviewChain
        : '\u2248 ' + converted.toFixed(6) + ' ' + payerPreviewToken + ' on ' + payerPreviewChain;
      document.getElementById('payer-conversion-info').textContent = info;
    }

    function payerClickPay() {
      // Populate success step
      document.getElementById('payer-success-amount').textContent =
        document.getElementById('payer-preview-amount').textContent;
      document.getElementById('payer-success-desc').textContent = payerPreviewDesc;
      document.getElementById('payer-success-desc').style.display = payerPreviewDesc ? 'block' : 'none';

      var chainObj = PAYER_CHAINS.find(function(c) { return c.name === payerPreviewChain; }) || PAYER_CHAINS[0];
      document.getElementById('payer-success-token').innerHTML =
        '<img src="' + resolveIcon(PAYER_TOKEN_ICONS[payerPreviewToken]) + '" alt="' + payerPreviewToken + '"> ' + payerPreviewToken;
      document.getElementById('payer-success-chain').innerHTML =
        '<img src="' + resolveIcon(chainObj.icon) + '" alt="' + chainObj.name + '"> ' + chainObj.name;

      // Hide step 2, show step 3
      document.getElementById('payer-step-2').classList.remove('active');
      document.getElementById('payer-step-3').classList.add('active');
    }

    function closePayerPreview() {
      document.getElementById('payer-preview-modal').classList.remove('active');
    }

    document.getElementById('payer-preview-modal').addEventListener('click', function(e) {
      if (e.target === this) closePayerPreview();
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && document.getElementById('payer-preview-modal').classList.contains('active')) {
        closePayerPreview();
      }
    });

    // Init payin icons and conversion on DOMContentLoaded
    window.addEventListener('DOMContentLoaded', function() {
      payinInitIcons();
      payinUpdateReceiveAsRow();
      payinUpdateConversionLabel();
    });

    // ============================================
    // TOAST (shared)
    // ============================================
    function showToast(msg) {
      var toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(function() { toast.classList.remove('show'); }, 2500);
    }

    // ============================================
    // PAYOUT — STATE & DATA
    // ============================================
    var PAYOUT_TOKENS = {
      USDC: { icon: 'icons/tokens/usdc.svg', rate: 1 },
      USDT: { icon: 'icons/tokens/usdt.svg', rate: 1 },
      DAI:  { icon: 'icons/tokens/dai.svg',  rate: 1 }
    };

    var PAYOUT_CHAINS = {
      Base:      { icon: 'icons/chains/base.svg',      explorer: 'https://basescan.org/tx/' },
      Arbitrum:  { icon: 'icons/chains/arb.svg',       explorer: 'https://arbiscan.io/tx/' },
      Optimism:  { icon: 'icons/chains/optimism.svg',  explorer: 'https://optimistic.etherscan.io/tx/' },
      Polygon:   { icon: 'icons/chains/polygon.svg',   explorer: 'https://polygonscan.com/tx/' },
      Ethereum:  { icon: 'icons/chains/eth_chain.svg', explorer: 'https://etherscan.io/tx/' },
      'BNB Chain': { icon: 'icons/chains/bnb.svg',     explorer: 'https://bscscan.com/tx/' }
    };

    var payoutState = {
      balance: 15730,
      recipients: [
        { address: '0x1a2B3c4D5e6F7890aBcDeF1234567890abCDeF12', amount: '500',  token: 'USDC', chain: 'Base' },
        { address: '0x3c4D5e6F7890AbCdEf1234567890aBcDeF345678', amount: '0.1',   token: 'ETH',  chain: 'Arbitrum' },
        { address: '0x7e8F9a0B1c2D3e4F5a6B7c8D9e0F1a2B3c4D9A01', amount: '1200', token: 'USDC', chain: 'Optimism' }
      ],
      memo: 'March 2026 Payroll'
    };

    // ============================================
    // PAYOUT — MINI DROPDOWNS
    // ============================================
    // ── Payout source chain/token selectors ──
    var payoutSource = { chain: 'polygon', token: 'USDC' };
    var _payoutBalanceData = null; // cached from loadProdDashboard

    function payoutToggleSourceDropdown(type) {
      var select = document.getElementById('payout-source-' + type + '-select');
      var menu = document.getElementById('payout-source-' + type + '-dropdown');
      var isOpen = menu.classList.contains('open');
      payoutCloseSourceDropdowns();
      if (!isOpen) { select.classList.add('open'); menu.classList.add('open'); }
    }

    function payoutCloseSourceDropdowns() {
      ['chain', 'token'].forEach(function(t) {
        var m = document.getElementById('payout-source-' + t + '-dropdown');
        var s = document.getElementById('payout-source-' + t + '-select');
        if (m) m.classList.remove('open');
        if (s) s.classList.remove('open');
      });
    }

    function payoutSelectSource(type, value, label, icon) {
      payoutSource[type] = value;
      var select = document.getElementById('payout-source-' + type + '-select');
      select.innerHTML = '<img src="' + resolveIcon(icon) + '" alt="' + label + '"> ' + label + ' <span class="chevron">&#9660;</span>';
      var dropdown = document.getElementById('payout-source-' + type + '-dropdown');
      dropdown.querySelectorAll('.dropdown-option').forEach(function(opt) {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });
      payoutCloseSourceDropdowns();
      payoutUpdateSourceBalance();
    }

    function payoutUpdateSourceBalance() {
      var el = document.getElementById('payout-source-balance');
      if (!el || !_payoutBalanceData) return;
      var bal = 0;
      var data = _payoutBalanceData;
      // Check on-chain balance for selected chain+token
      if (data.onChainBalances && data.onChainBalances[payoutSource.chain]) {
        var tb = data.onChainBalances[payoutSource.chain][payoutSource.token];
        if (tb) bal += parseFloat(tb.balance || 0);
      }
      // Add gateway balance (USDC only)
      if (payoutSource.token === 'USDC' && data.gatewayBalances && data.gatewayBalances[payoutSource.chain]) {
        bal += parseFloat(data.gatewayBalances[payoutSource.chain] || 0);
      }
      el.textContent = bal > 0
        ? 'Available: ' + bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + ' ' + payoutSource.token
        : 'No ' + payoutSource.token + ' on ' + payoutSource.chain;
    }

    // Init source dropdown icons
    document.addEventListener('DOMContentLoaded', function() {
      var chainImg = document.getElementById('payout-source-chain-img');
      if (chainImg) chainImg.src = resolveIcon('icons/chains/polygon.svg');
      var tokenImg = document.getElementById('payout-source-token-img');
      if (tokenImg) tokenImg.src = resolveIcon('icons/tokens/usdc.svg');
      document.querySelectorAll('.payout-src-chain-img').forEach(function(img) {
        var p = img.getAttribute('data-icon'); if (p) img.src = resolveIcon(p);
      });
      document.querySelectorAll('.payout-src-token-img').forEach(function(img) {
        var p = img.getAttribute('data-icon'); if (p) img.src = resolveIcon(p);
      });
    });

    // Close source dropdowns on outside click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#view-payout .dropdown-wrapper')) {
        payoutCloseSourceDropdowns();
      }
    });

    function payoutCloseMiniDropdowns() {
      document.querySelectorAll('#view-payout .mini-dropdown-menu').forEach(function(m) { m.classList.remove('open'); });
      document.querySelectorAll('#view-payout .mini-select').forEach(function(s) { s.classList.remove('open'); });
    }

    function payoutToggleMiniDropdown(rowIdx, type, el) {
      var menu = el.nextElementSibling;
      var isOpen = menu.classList.contains('open');
      payoutCloseMiniDropdowns();
      if (!isOpen) {
        el.classList.add('open');
        menu.classList.add('open');
      }
    }

    document.addEventListener('click', function(e) {
      if (!e.target.closest('#view-payout .mini-dropdown-wrapper')) {
        payoutCloseMiniDropdowns();
      }
    });

    function payoutSelectMiniOption(rowIdx, type, value) {
      payoutState.recipients[rowIdx][type] = value;
      payoutRenderRecipients();
      payoutUpdateSummary();
    }

    // ── Token addresses per chain (for API calls) ──
    var TOKEN_ADDRESSES = {
      polygon: {
        USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        DAI:  '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      },
      base: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
        DAI:  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      },
      arbitrum: {
        USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        DAI:  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      },
      optimism: {
        USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        DAI:  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      },
      avalanche: {
        USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
        USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
        DAI:  '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70',
      },
    };

    function resolveTokenAddress(symbol, chain) {
      var chainKey = chain.toLowerCase();
      return TOKEN_ADDRESSES[chainKey] && TOKEN_ADDRESSES[chainKey][symbol] || null;
    }

    // ============================================
    // PAYOUT — RECIPIENTS CRUD
    // ============================================
    function payoutTruncateAddr(addr) {
      if (!addr || addr.length < 12) return addr;
      return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    function payoutRenderRecipients() {
      var list = document.getElementById('payout-recipient-list');
      list.innerHTML = payoutState.recipients.map(function(r, i) {
        var tokenData = PAYOUT_TOKENS[r.token] || PAYOUT_TOKENS.USDC;
        var chainData = PAYOUT_CHAINS[r.chain] || PAYOUT_CHAINS.Base;

        var tokenOptions = Object.keys(PAYOUT_TOKENS).map(function(t) {
          return '<div class="mini-dropdown-option ' + (t === r.token ? 'selected' : '') + '" onclick="payoutSelectMiniOption(' + i + ',\'token\',\'' + t + '\')">' +
            '<img src="' + resolveIcon(PAYOUT_TOKENS[t].icon) + '" alt="' + t + '"> ' + t +
          '</div>';
        }).join('');

        var chainOptions = Object.keys(PAYOUT_CHAINS).map(function(c) {
          return '<div class="mini-dropdown-option ' + (c === r.chain ? 'selected' : '') + '" onclick="payoutSelectMiniOption(' + i + ',\'chain\',\'' + c + '\')">' +
            '<img src="' + resolveIcon(PAYOUT_CHAINS[c].icon) + '" alt="' + c + '"> ' + c +
          '</div>';
        }).join('');

        return '<div class="recipient-row">' +
          '<div class="recipient-num">' + (i + 1) + '</div>' +
          '<input class="recipient-address" type="text" placeholder="0x..." value="' + r.address + '" oninput="payoutUpdateRecipientField(' + i + ',\'address\',this.value)">' +
          '<input class="recipient-amount" type="text" placeholder="0" value="' + r.amount + '" oninput="payoutUpdateRecipientField(' + i + ',\'amount\',this.value)">' +
          '<div class="mini-dropdown-wrapper token-dd">' +
            '<div class="mini-select" onclick="payoutToggleMiniDropdown(' + i + ',\'token\',this)">' +
              '<img src="' + resolveIcon(tokenData.icon) + '" alt="' + r.token + '">' +
              '<span class="mini-label">' + r.token + '</span>' +
              '<span class="chevron">&#9660;</span>' +
            '</div>' +
            '<div class="mini-dropdown-menu">' + tokenOptions + '</div>' +
          '</div>' +
          '<div class="mini-dropdown-wrapper chain-dd">' +
            '<div class="mini-select" onclick="payoutToggleMiniDropdown(' + i + ',\'chain\',this)">' +
              '<img src="' + resolveIcon(chainData.icon) + '" alt="' + r.chain + '">' +
              '<span class="mini-label">' + r.chain + '</span>' +
              '<span class="chevron">&#9660;</span>' +
            '</div>' +
            '<div class="mini-dropdown-menu">' + chainOptions + '</div>' +
          '</div>' +
          '<button class="delete-btn" onclick="payoutRemoveRecipient(' + i + ')" title="Remove">&#10005;</button>' +
        '</div>';
      }).join('');
    }

    function payoutUpdateRecipientField(idx, field, value) {
      payoutState.recipients[idx][field] = value;
      payoutUpdateSummary();
    }

    function payoutAddRecipient() {
      payoutState.recipients.push({ address: '', amount: '', token: 'USDC', chain: 'Base' });
      payoutRenderRecipients();
      payoutUpdateSummary();
      setTimeout(function() {
        var inputs = document.querySelectorAll('#payout-recipient-list .recipient-address');
        if (inputs.length) inputs[inputs.length - 1].focus();
      }, 50);
    }

    function payoutRemoveRecipient(idx) {
      if (payoutState.recipients.length <= 1) {
        showToast('Need at least 1 recipient');
        return;
      }
      payoutState.recipients.splice(idx, 1);
      payoutRenderRecipients();
      payoutUpdateSummary();
    }

    // ============================================
    // PAYOUT — CSV IMPORT
    // ============================================
    function payoutImportCSV() {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      input.onchange = function(e) {
        var reader = new FileReader();
        reader.onload = function(ev) {
          var lines = ev.target.result.split('\n').filter(function(l) { return l.trim(); });
          var parsed = [];
          for (var j = 0; j < lines.length; j++) {
            var cols = lines[j].split(',').map(function(c) { return c.trim(); });
            if (cols[0] && cols[0].toLowerCase().includes('address')) continue;
            if (cols.length >= 2 && cols[0].startsWith('0x')) {
              parsed.push({
                address: cols[0],
                amount: cols[1] || '0',
                token: (cols[2] || 'USDC').toUpperCase(),
                chain: cols[3] || 'Base'
              });
            }
          }
          if (parsed.length > 0) {
            payoutState.recipients = parsed;
            payoutRenderRecipients();
            payoutUpdateSummary();
            showToast(parsed.length + ' recipient' + (parsed.length > 1 ? 's' : '') + ' imported');
          } else {
            showToast('No valid rows found in CSV');
          }
        };
        reader.readAsText(e.target.files[0]);
      };
      input.click();
    }

    // ============================================
    // PAYOUT — SUMMARY
    // ============================================
    function payoutCalcTotal() {
      var total = 0;
      for (var i = 0; i < payoutState.recipients.length; i++) {
        var r = payoutState.recipients[i];
        var amt = parseFloat(r.amount) || 0;
        var rate = (PAYOUT_TOKENS[r.token] || PAYOUT_TOKENS.USDC).rate;
        total += amt * rate;
      }
      return total;
    }

    function payoutCountChains() {
      var s = {};
      for (var i = 0; i < payoutState.recipients.length; i++) {
        s[payoutState.recipients[i].chain] = true;
      }
      return Object.keys(s).length;
    }

    function payoutFormatUSD(n) {
      return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function payoutUpdateSummary() {
      var total = payoutCalcTotal();
      var chains = payoutCountChains();
      var count = payoutState.recipients.length;
      document.getElementById('payout-summary').innerHTML =
        '<span>' + count + '</span> recipient' + (count !== 1 ? 's' : '') +
        ' &middot; <span>' + chains + '</span> chain' + (chains !== 1 ? 's' : '') +
        ' &middot; ~<span>' + payoutFormatUSD(total) + '</span> total';
    }

    // ============================================
    // PAYOUT — STATE NAVIGATION
    // ============================================
    function payoutHandleReview() {
      if (!isAuthenticated) {
        openAuthModal(function() { payoutHandleReview(); });
        return;
      }
      var valid = payoutState.recipients.some(function(r) { return r.address && r.amount; });
      if (!valid) {
        showToast('Add at least one recipient with address and amount');
        return;
      }
      payoutShowReview();
    }

    function payoutShowReview() {
      var table = document.getElementById('payout-review-table');
      var headerHtml =
        '<div class="review-header">' +
          '<div class="col-num">#</div>' +
          '<div class="col-addr">Recipient</div>' +
          '<div class="col-amount">Amount</div>' +
          '<div class="col-delivery">Delivery</div>' +
        '</div>';

      var rowsHtml = payoutState.recipients.filter(function(r) { return r.address && r.amount; }).map(function(r, i) {
        var tokenData = PAYOUT_TOKENS[r.token] || PAYOUT_TOKENS.USDC;
        var chainData = PAYOUT_CHAINS[r.chain] || PAYOUT_CHAINS.Base;
        var amt = parseFloat(r.amount) || 0;
        var usdVal = amt * tokenData.rate;
        return '<div class="review-row">' +
          '<div class="col-num">' + (i + 1) + '</div>' +
          '<div class="col-addr">' + payoutTruncateAddr(r.address) + '</div>' +
          '<div class="col-amount">' + payoutFormatUSD(usdVal) + '</div>' +
          '<div class="col-delivery">' +
            '<img src="' + resolveIcon(tokenData.icon) + '" alt="' + r.token + '"> ' +
            r.token + ' &middot; ' + r.chain +
          '</div>' +
        '</div>';
      }).join('');

      table.innerHTML = headerHtml + rowsHtml;

      var total = payoutCalcTotal();
      var chains = payoutCountChains();
      var count = payoutState.recipients.filter(function(r) { return r.address && r.amount; }).length;
      var memo = document.getElementById('payout-memo-input').value;
      payoutState.memo = memo;

      var totalsHtml =
        '<div class="total-amount">' + payoutFormatUSD(total) + '</div>' +
        '<div class="total-label">from unified balance</div>' +
        '<div class="total-meta">Recipients: ' + count + ' &middot; Chains: ' + chains + '</div>';
      if (memo) {
        totalsHtml += '<div class="total-memo">Memo: ' + memo + '</div>';
      }
      document.getElementById('payout-review-totals').innerHTML = totalsHtml;

      document.getElementById('payout-form').style.display = 'none';
      document.getElementById('payout-review').style.display = 'block';
      document.getElementById('payout-review').style.animation = 'fadeInUp 0.35s ease';
    }

    function payoutShowForm() {
      document.getElementById('payout-review').style.display = 'none';
      document.getElementById('payout-form').style.display = 'block';
    }

    function payoutHandleSend() {
      if (isProd()) {
        payoutSendProd();
      } else {
        payoutShowPayoutResult();
      }
    }

    async function payoutSendProd() {
      var validRecipients = payoutState.recipients.filter(function(r) { return r.address && r.amount; });
      if (validRecipients.length === 0) {
        showToast('No valid recipients');
        return;
      }

      // Map chain display names to chain keys
      var CHAIN_KEY_MAP = {
        'Base': 'base', 'Arbitrum': 'arbitrum', 'Optimism': 'optimism',
        'Polygon': 'polygon', 'Avalanche': 'avalanche', 'Ethereum': 'ethereum'
      };

      try {
        // 1. Prepare via POST /v1/operations/send (supports batch)
        var sourceChainKey = payoutSource.chain;
        var sourceTokenAddr = resolveTokenAddress(payoutSource.token, sourceChainKey);

        var recipients = validRecipients.map(function(r) {
          var destChain = CHAIN_KEY_MAP[r.chain] || r.chain.toLowerCase();
          var destTokenAddr = resolveTokenAddress(r.token, destChain);
          var rec = {
            address: r.address,
            chain: destChain,
            amount: r.amount,
          };
          // If dest token differs from source token, set outputToken for swap
          if (destTokenAddr && destTokenAddr !== sourceTokenAddr) {
            rec.outputToken = destTokenAddr;
          }
          return rec;
        });

        var sendPayload = {
          recipients: recipients,
          sourceChain: sourceChainKey,
          sourceToken: sourceTokenAddr,
        };
        var operation = await apiPost('operations/send', sendPayload);

        // 2. Group signRequests by chain, batch all calls into one UserOp per chain
        var userSignRequests = (operation.signRequests || []).filter(function(sr) { return !sr.serverSide && sr.calls; });
        if (userSignRequests.length > 0) {
          // Group by chain
          var byChain = {};
          userSignRequests.forEach(function(sr) {
            if (!byChain[sr.chain]) byChain[sr.chain] = [];
            byChain[sr.chain].push(sr);
          });

          var signatures = [];
          var chainKeys = Object.keys(byChain);
          for (var ci = 0; ci < chainKeys.length; ci++) {
            var chain = chainKeys[ci];
            var chainSRs = byChain[chain];

            // Merge all calls from all signRequests on this chain
            var allCalls = [];
            chainSRs.forEach(function(sr) {
              if (sr.calls) sr.calls.forEach(function(c) { allCalls.push(c); });
            });

            // 2a. Prepare single batched UserOp
            var prepared = await apiPost('wallet/userop/prepare', {
              chain: chain,
              calls: allCalls,
            });

            // 2b. Sign once with passkey
            var signed = await signUserOpWithPasskey(prepared);

            // 2c. Submit → one txHash
            var result = await apiPost('wallet/userop/submit', signed);

            // Map txHash to all steps on this chain
            chainSRs.forEach(function(sr) {
              signatures.push({ stepId: sr.stepId, txHash: result.txHash });
            });
          }

          // 3. Submit all txHashes to operation
          await apiPost('operations/' + operation.id + '/submit', { signatures: signatures });
        }

        payoutShowPayoutResult();
        showToast('Payout sent!');
      } catch (e) {
        showToast('Payout failed: ' + e.message);
        console.error('Payout error:', e);
      }
    }

    async function signUserOpWithPasskey(prepared) {
      // prepared = { requestId, chain, userOpHash }
      var hashHex = prepared.userOpHash;
      if (!hashHex) throw new Error('No userOpHash to sign');

      // Convert hex hash to bytes for WebAuthn challenge
      var hashBytes = new Uint8Array(hashHex.replace('0x', '').match(/.{2}/g).map(function(b) { return parseInt(b, 16); }));

      var publicKeyOptions = {
        challenge: hashBytes,
        rpId: window.location.hostname,
        timeout: 60000,
        userVerification: 'preferred'
      };

      // Pre-select credential so browser doesn't show picker
      var credId = CURRENT_USER && CURRENT_USER.credentialId;
      if (credId) {
        var rawId = Uint8Array.from(atob(credId.replace(/-/g, '+').replace(/_/g, '/')), function(c) { return c.charCodeAt(0); });
        publicKeyOptions.allowCredentials = [{ type: 'public-key', id: rawId }];
      }

      var assertion = await navigator.credentials.get({ publicKey: publicKeyOptions });

      // Convert DER signature to r||s hex (same as delegate signing flow)
      var derSig = new Uint8Array(assertion.response.signature);
      var rs = derToRS(derSig);
      var sigHex = '0x' + bytesToHex(rs.r, 32) + bytesToHex(rs.s, 32);

      var authDataHex = '0x' + bytesToHex(new Uint8Array(assertion.response.authenticatorData));
      var clientDataStr = new TextDecoder().decode(assertion.response.clientDataJSON);
      var challengeIndex = clientDataStr.indexOf('"challenge"');
      var typeIndex = clientDataStr.indexOf('"type"');

      return {
        requestId: prepared.requestId,
        signature: sigHex,
        webauthn: {
          authenticatorData: authDataHex,
          clientDataJSON: clientDataStr,
          challengeIndex: challengeIndex,
          typeIndex: typeIndex,
          userVerificationRequired: true,
        },
      };
    }

    function payoutShowPayoutResult() {
      var total = payoutCalcTotal();
      var chains = payoutCountChains();
      var validRecipients = payoutState.recipients.filter(function(r) { return r.address && r.amount; });
      var count = validRecipients.length;

      document.getElementById('payout-result-total-amount').textContent = payoutFormatUSD(total);
      document.getElementById('payout-result-total-meta').textContent =
        count + ' recipient' + (count !== 1 ? 's' : '') + ' \u00b7 ' + chains + ' chain' + (chains !== 1 ? 's' : '');

      var resultList = document.getElementById('payout-result-list');
      resultList.innerHTML = validRecipients.map(function(r, i) {
        var tokenData = PAYOUT_TOKENS[r.token] || PAYOUT_TOKENS.USDC;
        var chainData = PAYOUT_CHAINS[r.chain] || PAYOUT_CHAINS.Base;
        var amt = parseFloat(r.amount) || 0;
        var usdVal = amt * tokenData.rate;
        var fakeTx = '0x' + Array.from({length: 8}, function() { return Math.floor(Math.random()*16).toString(16); }).join('') + '...';
        return '<div class="result-row">' +
          '<div class="result-row-check">&#10003;</div>' +
          '<div class="result-row-addr">' + payoutTruncateAddr(r.address) + '</div>' +
          '<div class="result-row-amount">' + payoutFormatUSD(usdVal) + '</div>' +
          '<div class="result-row-delivery">' +
            '<img src="' + resolveIcon(tokenData.icon) + '" alt="' + r.token + '"> ' +
            r.token + ' &middot; ' + r.chain +
          '</div>' +
          '<a class="result-row-explorer" href="' + chainData.explorer + fakeTx + '" target="_blank" title="View on explorer">&#128279;</a>' +
        '</div>';
      }).join('');

      document.getElementById('payout-review').style.display = 'none';
      document.getElementById('payout-result').style.display = 'block';
      document.getElementById('payout-result').style.animation = 'fadeInUp 0.35s ease';
    }

    function payoutResetForm() {
      payoutState.recipients = [
        { address: '', amount: '', token: 'USDC', chain: 'Base' }
      ];
      document.getElementById('payout-memo-input').value = '';
      payoutState.memo = '';
      payoutRenderRecipients();
      payoutUpdateSummary();
      document.getElementById('payout-result').style.display = 'none';
      document.getElementById('payout-form').style.display = 'block';
    }

    // ============================================
    // PAYOUT — DOWNLOAD RECEIPT
    // ============================================
    function payoutDownloadReceipt() {
      var validRecipients = payoutState.recipients.filter(function(r) { return r.address && r.amount; });
      var csv = 'Recipient,Amount,Token,Chain,USD Value,Status,TX Hash\n';
      for (var i = 0; i < validRecipients.length; i++) {
        var r = validRecipients[i];
        var tokenData = PAYOUT_TOKENS[r.token] || PAYOUT_TOKENS.USDC;
        var amt = parseFloat(r.amount) || 0;
        var usdVal = (amt * tokenData.rate).toFixed(2);
        var fakeTx = '0x' + Array.from({length: 64}, function() { return Math.floor(Math.random()*16).toString(16); }).join('');
        csv += r.address + ',' + r.amount + ',' + r.token + ',' + r.chain + ',' + usdVal + ',Completed,' + fakeTx + '\n';
      }
      csv += '\nTotal,,,,' + payoutFormatUSD(payoutCalcTotal()) + ',,\n';
      csv += 'Memo: ' + (payoutState.memo || 'N/A') + '\n';
      csv += 'Date: ' + new Date().toISOString() + '\n';

      var blob = new Blob([csv], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'omniflow-payout-' + Date.now() + '.csv';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Receipt downloaded');
    }

    // ============================================
    // HISTORY VIEW
    // ============================================
    var historyCurrentPage = 1;
    var historyActiveTab = 'all';
    var historyFilters = { chain: 'all', token: 'all', status: 'all' };
    var HISTORY_PAGE_SIZE = 7;

    var historyAllTransactions = [
      // TODAY
      { date: 'TODAY', type: 'payout', desc: 'Batch #12 \u00b7 5 recipients', chain: 'base', chainLabel: 'Base', chainIcon: 'icons/chains/base.svg', crossChain: null, token: 'usdc', amount: '-$5,240', amountClass: 'outgoing', time: '14:14', status: 'completed' },
      { date: 'TODAY', type: 'payin', desc: 'Invoice #23 from <span class="mono">0xAb..3f</span>', chain: 'ethereum', chainLabel: 'Ethereum', chainIcon: 'icons/chains/eth_chain.svg', crossChain: { toLabel: 'Base', toIcon: 'icons/chains/base.svg' }, token: 'usdc', amount: '+$2,100', amountClass: 'incoming', time: '13:45', status: 'completed' },
      { date: 'TODAY', type: 'topup', desc: 'Top Up from MetaMask', chain: 'ethereum', chainLabel: 'Ethereum', chainIcon: 'icons/chains/eth_chain.svg', crossChain: null, token: 'usdc', amount: '+$10,000', amountClass: 'incoming', time: '11:30', status: 'completed' },
      // YESTERDAY
      { date: 'YESTERDAY', type: 'payout', desc: 'Payout to <span class="mono">0x8b..34</span>', chain: 'arbitrum', chainLabel: 'Arbitrum', chainIcon: 'icons/chains/arb.svg', crossChain: null, token: 'usdc', amount: '-$1,200', amountClass: 'outgoing', time: '16:20', status: 'completed' },
      { date: 'YESTERDAY', type: 'payin', desc: 'Received from <span class="mono">0x3f..bC</span>', chain: 'polygon', chainLabel: 'Polygon', chainIcon: 'icons/chains/polygon.svg', crossChain: null, token: 'usdc', amount: '+$3,330', amountClass: 'incoming', time: '09:15', status: 'processing' },
      // MAR 2
      { date: 'MAR 2', type: 'payout', desc: 'Batch #11 \u00b7 3 recipients', chain: 'base', chainLabel: 'Base', chainIcon: 'icons/chains/base.svg', crossChain: null, token: 'usdc', amount: '-$8,750', amountClass: 'outgoing', time: '14:00', status: 'completed' },
      { date: 'MAR 2', type: 'topup', desc: 'Top Up from MetaMask', chain: 'base', chainLabel: 'Base', chainIcon: 'icons/chains/base.svg', crossChain: null, token: 'usdc', amount: '+$15,000', amountClass: 'incoming', time: '10:00', status: 'completed' },
      // MAR 1
      { date: 'MAR 1', type: 'payin', desc: 'Invoice #22 from <span class="mono">0xCd..9a</span>', chain: 'ethereum', chainLabel: 'Ethereum', chainIcon: 'icons/chains/eth_chain.svg', crossChain: null, token: 'eth', amount: '+$6,400', amountClass: 'incoming', time: '15:30', status: 'completed' },
      { date: 'MAR 1', type: 'payout', desc: 'Payout to <span class="mono">0x2e..7F</span>', chain: 'base', chainLabel: 'Base', chainIcon: 'icons/chains/base.svg', crossChain: null, token: 'usdc', amount: '-$900', amountClass: 'outgoing', time: '12:45', status: 'pending' },
      // FEB 28
      { date: 'FEB 28', type: 'topup', desc: 'Top Up from Rabby', chain: 'arbitrum', chainLabel: 'Arbitrum', chainIcon: 'icons/chains/arb.svg', crossChain: null, token: 'usdc', amount: '+$5,000', amountClass: 'incoming', time: '09:00', status: 'completed' },
      { date: 'FEB 28', type: 'payout', desc: 'Batch #10 \u00b7 8 recipients', chain: 'base', chainLabel: 'Base', chainIcon: 'icons/chains/base.svg', crossChain: null, token: 'usdc', amount: '-$12,400', amountClass: 'outgoing', time: '17:30', status: 'completed' },
      { date: 'FEB 28', type: 'payin', desc: 'Received from <span class="mono">0xFa..12</span>', chain: 'optimism', chainLabel: 'Optimism', chainIcon: 'icons/chains/optimism.svg', crossChain: { toLabel: 'Base', toIcon: 'icons/chains/base.svg' }, token: 'usdc', amount: '+$1,850', amountClass: 'incoming', time: '11:20', status: 'completed' },
      // FEB 27
      { date: 'FEB 27', type: 'payout', desc: 'Payout to <span class="mono">0x91..eC</span>', chain: 'ethereum', chainLabel: 'Ethereum', chainIcon: 'icons/chains/eth_chain.svg', crossChain: null, token: 'eth', amount: '-$3,200', amountClass: 'outgoing', time: '14:10', status: 'completed' },
      { date: 'FEB 27', type: 'topup', desc: 'Top Up from MetaMask', chain: 'polygon', chainLabel: 'Polygon', chainIcon: 'icons/chains/polygon.svg', crossChain: null, token: 'usdc', amount: '+$2,000', amountClass: 'incoming', time: '10:30', status: 'completed' },
      // FEB 26
      { date: 'FEB 26', type: 'payin', desc: 'Invoice #21 from <span class="mono">0xBb..4D</span>', chain: 'base', chainLabel: 'Base', chainIcon: 'icons/chains/base.svg', crossChain: null, token: 'usdc', amount: '+$4,500', amountClass: 'incoming', time: '16:00', status: 'completed' },
      { date: 'FEB 26', type: 'payout', desc: 'Batch #9 \u00b7 2 recipients', chain: 'arbitrum', chainLabel: 'Arbitrum', chainIcon: 'icons/chains/arb.svg', crossChain: null, token: 'usdc', amount: '-$2,100', amountClass: 'outgoing', time: '13:15', status: 'completed' },
      { date: 'FEB 26', type: 'topup', desc: 'Top Up from Rabby', chain: 'ethereum', chainLabel: 'Ethereum', chainIcon: 'icons/chains/eth_chain.svg', crossChain: null, token: 'usdc', amount: '+$8,000', amountClass: 'incoming', time: '09:45', status: 'completed' }
    ];

    function historyGetFilteredTransactions() {
      return historyAllTransactions.filter(function(tx) {
        if (historyActiveTab !== 'all' && tx.type !== historyActiveTab) return false;
        if (historyFilters.chain !== 'all' && tx.chain !== historyFilters.chain) return false;
        if (historyFilters.token !== 'all' && tx.token !== historyFilters.token) return false;
        if (historyFilters.status !== 'all' && tx.status !== historyFilters.status) return false;
        return true;
      });
    }

    function historyRenderTransactions() {
      if (isProd()) {
        var container = document.getElementById('history-tx-list');
        if (container) container.innerHTML = '<div style="text-align:center;color:#c4b5fd;font-size:12px;padding:40px 0;">Coming soon</div>';
        return;
      }
      var filtered = historyGetFilteredTransactions();
      var totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
      if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;

      var start = (historyCurrentPage - 1) * HISTORY_PAGE_SIZE;
      var page = filtered.slice(start, start + HISTORY_PAGE_SIZE);

      var container = document.getElementById('history-tx-list');
      var html = '';
      var lastDate = '';

      page.forEach(function(tx) {
        if (tx.date !== lastDate) {
          html += '<div class="history-date-header">' + tx.date + '</div>';
          lastDate = tx.date;
        }

        var iconClass = (tx.type === 'payout') ? 'outgoing' : 'incoming';
        var iconArrow = (tx.type === 'payout') ? '\u2191' : '\u2193';

        var chainHtml = '';
        if (tx.crossChain) {
          chainHtml = '<img src="' + resolveIcon(tx.chainIcon) + '" alt="' + tx.chainLabel + '"> ' + tx.chainLabel + ' <span class="arrow">\u2192</span> <img src="' + resolveIcon(tx.crossChain.toIcon) + '" alt="' + tx.crossChain.toLabel + '"> ' + tx.crossChain.toLabel;
        } else {
          chainHtml = '<img src="' + resolveIcon(tx.chainIcon) + '" alt="' + tx.chainLabel + '"> ' + tx.chainLabel;
        }

        var statusHtml = '';
        if (tx.status !== 'completed') {
          statusHtml = '<div class="history-tx-status-badge ' + tx.status + '">' + tx.status + '</div>';
        }

        html +=
          '<div class="history-tx-row" data-type="' + tx.type + '" data-chain="' + tx.chain + '" data-token="' + tx.token + '" data-status="' + tx.status + '">' +
            '<div class="history-tx-icon ' + iconClass + '">' + iconArrow + '</div>' +
            '<div class="history-tx-info">' +
              '<div class="history-tx-desc">' + tx.desc + '</div>' +
              '<div class="history-tx-chain">' + chainHtml + '</div>' +
            '</div>' +
            '<div class="history-tx-right">' +
              '<div class="history-tx-amount ' + tx.amountClass + '">' + tx.amount + '</div>' +
              '<div class="history-tx-time">' + tx.time + '</div>' +
              statusHtml +
            '</div>' +
          '</div>';
      });

      if (page.length === 0) {
        html = '<div style="text-align:center;padding:32px 0;color:#b0b4bd;font-size:14px;">No transactions found</div>';
      }

      container.innerHTML = html;

      // Update pagination info
      var total = filtered.length;
      var showStart = total === 0 ? 0 : start + 1;
      var showEnd = Math.min(start + HISTORY_PAGE_SIZE, total);
      document.getElementById('history-pagination-info').textContent = 'Showing ' + showStart + '\u2013' + showEnd + ' of ' + total;

      // Update page buttons
      var pageBtns = document.querySelectorAll('#view-history .history-page-btn[data-page]');
      pageBtns.forEach(function(btn) {
        var p = parseInt(btn.dataset.page);
        btn.classList.toggle('active', p === historyCurrentPage);
        btn.style.display = p <= totalPages ? '' : 'none';
      });
    }

    // History tab switching
    function historyInitTabs() {
      var tabs = document.querySelectorAll('#history-tabs .history-tab');
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          tabs.forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');
          historyActiveTab = tab.dataset.filter;
          historyCurrentPage = 1;
          historyRenderTransactions();
        });
      });
    }

    // History filter dropdowns
    function historyToggleFilter(type) {
      var pill = document.getElementById('history-' + type + '-filter');
      var dropdown = document.getElementById('history-' + type + '-filter-dropdown');
      var isOpen = dropdown.classList.contains('open');

      historyCloseAllFilters();

      if (!isOpen) {
        pill.classList.add('open');
        dropdown.classList.add('open');
      }
    }

    function historyCloseAllFilters() {
      document.querySelectorAll('#view-history .history-filter-pill').forEach(function(p) { p.classList.remove('open'); });
      document.querySelectorAll('#view-history .history-filter-dropdown').forEach(function(d) { d.classList.remove('open'); });
    }

    function historySelectFilter(type, label, value, event) {
      event.stopPropagation();
      historyFilters[type] = value;

      var pill = document.getElementById('history-' + type + '-filter');
      pill.childNodes[0].textContent = label + ' ';

      var dropdown = document.getElementById('history-' + type + '-filter-dropdown');
      dropdown.querySelectorAll('.history-filter-option').forEach(function(opt) {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });

      historyCloseAllFilters();
      historyCurrentPage = 1;
      historyRenderTransactions();
    }

    // Close history filters on outside click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.history-filter-pill')) {
        historyCloseAllFilters();
      }
    });

    // History pagination
    function historyGoPage(page) {
      var filtered = historyGetFilteredTransactions();
      var totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
      if (page < 1 || page > totalPages) return;
      historyCurrentPage = page;
      historyRenderTransactions();
    }

    // History CSV export
    function historyExportCSV() {
      var filtered = historyGetFilteredTransactions();
      var csv = 'Date,Type,Description,Chain,Token,Amount,Status,Time\n';
      filtered.forEach(function(tx) {
        var desc = tx.desc.replace(/<[^>]*>/g, '');
        csv += tx.date + ',' + tx.type + ',"' + desc + '",' + tx.chainLabel + ',' + tx.token.toUpperCase() + ',"' + tx.amount + '",' + tx.status + ',' + tx.time + '\n';
      });

      var blob = new Blob([csv], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'omniflow-history-' + Date.now() + '.csv';
      a.click();
      URL.revokeObjectURL(url);
      if (typeof showToast === 'function') showToast('History CSV downloaded');
    }

    // History icon init - resolve data-icon attributes in filter dropdowns
    function historyInitIcons() {
      document.querySelectorAll('#view-history .history-filter-option img[data-icon]').forEach(function(img) {
        var iconPath = img.getAttribute('data-icon');
        if (iconPath) img.src = resolveIcon(iconPath);
      });
    }

    // ============================================
    // PROD MODE — DASHBOARD DATA
    // ============================================
    async function loadProdDashboard() {
      if (!isProd() || !isAuthenticated) return;
      try {
        var data = await apiGet('wallet/balances');
        if (!data) return;

        // API returns { total, gatewayBalances: {chain: amount}, onChainBalances: {chain: {TOKEN: {symbol,balance,decimals}}} }
        var totalUsd = parseFloat(data.total || 0);
        var chainTotals = {};
        // Merge on-chain balances (multi-token per chain)
        if (data.onChainBalances) {
          Object.entries(data.onChainBalances).forEach(function(entry) {
            var chain = entry[0], tokens = entry[1];
            Object.values(tokens).forEach(function(tb) {
              var amt = parseFloat(tb.balance || 0);
              if (amt > 0) chainTotals[chain] = (chainTotals[chain] || 0) + amt;
            });
          });
        }
        // Add gateway balances (USDC only)
        if (data.gatewayBalances) {
          Object.entries(data.gatewayBalances).forEach(function(entry) {
            var chain = entry[0], amt = parseFloat(entry[1] || 0);
            if (amt > 0) chainTotals[chain] = (chainTotals[chain] || 0) + amt;
          });
        }

        // Update all balance displays (nav, dashboard, payout)
        var formattedTotal = '$' + totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        var navBalEl = document.getElementById('nav-balance');
        if (navBalEl) { navBalEl.textContent = formattedTotal; navBalEl.style.display = 'block'; }

        var dashBalEl = document.querySelector('#view-dashboard .balance-amount');
        if (dashBalEl) dashBalEl.textContent = formattedTotal;

        var payoutBalEl = document.querySelector('#payout-balance span');
        if (payoutBalEl) payoutBalEl.textContent = formattedTotal;

        // Cache for source selector balance display
        _payoutBalanceData = data;
        payoutUpdateSourceBalance();

        // Update payout balance breakdown (per-chain, per-token chips)
        var breakdownEl = document.getElementById('payout-balance-breakdown');
        if (breakdownEl) {
          var TOKEN_ICONS = {
            USDC: 'icons/tokens/usdc.svg', USDT: 'icons/tokens/usdt.svg', DAI: 'icons/tokens/dai.svg'
          };
          var CHAIN_LABELS = {
            polygon: 'Polygon', base: 'Base', arbitrum: 'Arbitrum',
            optimism: 'Optimism', avalanche: 'Avalanche', ethereum: 'Ethereum'
          };
          var chips = [];

          // Gateway balances (USDC only)
          if (data.gatewayBalances) {
            Object.entries(data.gatewayBalances).forEach(function(e) {
              var chain = e[0], amt = parseFloat(e[1] || 0);
              if (amt > 0.001) {
                chips.push({ chain: chain, token: 'USDC', amount: amt, source: 'gateway' });
              }
            });
          }

          // On-chain balances (multi-token)
          if (data.onChainBalances) {
            Object.entries(data.onChainBalances).forEach(function(e) {
              var chain = e[0], tokens = e[1];
              Object.values(tokens).forEach(function(tb) {
                var amt = parseFloat(tb.balance || 0);
                if (amt > 0.001) {
                  chips.push({ chain: chain, token: tb.symbol, amount: amt, source: 'wallet' });
                }
              });
            });
          }

          if (chips.length > 0) {
            breakdownEl.style.display = 'flex';
            breakdownEl.innerHTML = chips.map(function(c) {
              var tokenIcon = TOKEN_ICONS[c.token] || '';
              var chainLabel = CHAIN_LABELS[c.chain] || c.chain;
              var iconHtml = tokenIcon ? '<img src="' + resolveIcon(tokenIcon) + '" alt="' + c.token + '">' : '';
              var label = c.source === 'gateway' ? 'Gateway' : chainLabel;
              return '<div class="payout-bal-chip">' +
                iconHtml +
                c.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
                ' ' + c.token +
                ' <span class="bal-chain">' + label + '</span>' +
                '</div>';
            }).join('');
          } else {
            breakdownEl.style.display = 'none';
          }
        }

        // Update chain chips
        var chipContainer = document.querySelector('#view-dashboard .chain-chips');
        if (chipContainer && Object.keys(chainTotals).length > 0) {
          var CHAIN_ICONS = {
            'base': 'icons/chains/base.svg', 'base-sepolia': 'icons/chains/base.svg',
            'arbitrum': 'icons/chains/arb.svg', 'arbitrum-sepolia': 'icons/chains/arb.svg',
            'ethereum': 'icons/chains/eth_chain.svg', 'ethereum-sepolia': 'icons/chains/eth_chain.svg',
            'polygon': 'icons/chains/polygon.svg', 'optimism': 'icons/chains/optimism.svg',
            'arc-testnet': 'icons/chains/eth_chain.svg'
          };
          chipContainer.innerHTML = Object.entries(chainTotals).map(function(entry) {
            var chain = entry[0], val = entry[1];
            var icon = CHAIN_ICONS[chain] || 'icons/chains/eth_chain.svg';
            var label = chain.replace('-sepolia', '').replace('-testnet', '').replace(/^\w/, function(c) { return c.toUpperCase(); });
            return '<div class="chain-chip"><img src="' + resolveIcon(icon) + '" alt="' + label + '"> $' + val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '</div>';
          }).join('');
        }
      } catch (e) {
        console.error('Failed to load dashboard data:', e);
      }
    }

    // Refresh dashboard when navigating to it in prod mode
    var _origHandleRoute = handleRoute;
    handleRoute = function() {
      _origHandleRoute();
      var hash = location.hash.slice(1) || 'home';
      if ((hash === 'dashboard' || hash === 'payout') && isProd() && isAuthenticated) {
        loadProdDashboard();
      }
      if (hash === 'settings' && isProd() && isAuthenticated) {
        loadSettingsPage();
      }
    };

    // ============================================
    // SETTINGS PAGE
    // ============================================
    var CHAIN_NAMES = {
      polygon: 'Polygon', base: 'Base', arbitrum: 'Arbitrum',
      avalanche: 'Avalanche', optimism: 'Optimism'
    };

    async function loadSettingsPage() {
      if (!isProd() || !isAuthenticated) {
        var container = document.getElementById('settings-chains-list');
        if (container) container.innerHTML = '<div style="text-align:center;color:#c4b5fd;font-size:12px;padding:20px 0;">Available in prod mode</div>';
        return;
      }

      // Show wallet address
      var addrEl = document.getElementById('settings-wallet-address');
      var userAddr = CURRENT_USER && (CURRENT_USER.smartAccountAddress || CURRENT_USER.walletAddress);
      if (addrEl && userAddr) {
        addrEl.textContent = userAddr;
      }

      var container = document.getElementById('settings-chains-list');
      if (!container) return;
      container.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:12px;padding:20px 0;">Loading status...</div>';

      try {
        var data = await apiGet('wallet/executor-status');
        if (!data || !data.chains) {
          container.innerHTML = '<div style="color:#ef4444;font-size:12px;">Failed to load status</div>';
          return;
        }

        var html = '';
        Object.entries(data.chains).forEach(function(entry) {
          var chain = entry[0], status = entry[1];
          var name = CHAIN_NAMES[chain] || chain;
          var allGood = status.delegateConfirmed && status.ecdsaValidatorEnabled;

          html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#f9fafb;border-radius:10px;border:1px solid ' + (allGood ? '#d1fae5' : '#fee2e2') + ';">';
          html += '<div>';
          html += '<div style="font-size:13px;font-weight:700;">' + name + '</div>';
          html += '<div style="font-size:11px;color:#6b7280;margin-top:2px;">';

          if (allGood) {
            html += '<span style="color:#065f46;">Active</span>';
          } else {
            var steps = [];
            if (!status.delegateConfirmed) steps.push('Delegate');
            if (!status.ecdsaValidatorEnabled) steps.push('ECDSA module');
            html += '<span style="color:#991b1b;">Needs setup: ' + steps.join(', ') + '</span>';
          }

          html += '</div></div>';

          if (allGood) {
            html += '<div style="font-size:16px;color:#065f46;">&#x2713;</div>';
          } else {
            html += '<button onclick="setupChain(\'' + chain + '\')" style="padding:6px 16px;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;background:linear-gradient(135deg,#7c3aed,#6366f1);color:#fff;">Setup</button>';
          }

          html += '</div>';
        });

        container.innerHTML = html;

        // Show "Setup All" button if any chain needs setup
        var needsSetup = Object.values(data.chains).some(function(s) {
          return !s.delegateConfirmed || !s.ecdsaValidatorEnabled;
        });
        var setupAllWrap = document.getElementById('settings-setup-all-wrap');
        if (setupAllWrap) setupAllWrap.style.display = needsSetup ? 'block' : 'none';
      } catch (e) {
        container.innerHTML = '<div style="color:#ef4444;font-size:12px;">Error: ' + e.message + '</div>';
      }
    }

    async function setupAllChains() {
      if (!isProd() || !isAuthenticated) return;

      var btn = document.getElementById('btn-setup-all');
      var progress = document.getElementById('settings-setup-all-progress');
      if (btn) { btn.disabled = true; btn.textContent = 'Setting up...'; }
      if (progress) { progress.style.display = 'block'; }

      try {
        // Get current status to find chains that need setup
        var data = await apiGet('wallet/executor-status');
        if (!data || !data.chains) throw new Error('Failed to load status');

        var chainsToSetup = [];
        Object.entries(data.chains).forEach(function(entry) {
          var chain = entry[0], status = entry[1];
          if (!status.delegateConfirmed || !status.ecdsaValidatorEnabled) {
            chainsToSetup.push(chain);
          }
        });

        if (chainsToSetup.length === 0) {
          showToast('All chains already configured!');
          if (btn) { btn.disabled = false; btn.textContent = 'Setup All Chains'; }
          if (progress) progress.style.display = 'none';
          return;
        }

        for (var i = 0; i < chainsToSetup.length; i++) {
          var chain = chainsToSetup[i];
          var name = CHAIN_NAMES[chain] || chain;
          var step = (i + 1) + '/' + chainsToSetup.length;
          if (progress) progress.textContent = step + ' — ' + name + '...';

          await setupChainSilent(chain);
        }

        showToast('All chains configured!');
        loadSettingsPage();
      } catch (e) {
        showToast('Setup failed: ' + e.message);
      }

      if (btn) { btn.disabled = false; btn.textContent = 'Setup All Chains'; }
      if (progress) progress.style.display = 'none';
    }

    /** Setup a single chain without UI button manipulation — used by setupAllChains */
    async function setupChainSilent(chain) {
      var name = CHAIN_NAMES[chain] || chain;

      var data = await apiPost('wallet/setup-settlement', { chain: chain });
      if (data.alreadySetup) return;

      var submitBody = { chain: chain };

      if (data.needsUninstall) {
        var uninstallSigned = await signHashWithPasskey(data.uninstallUserOpHash);
        submitBody.uninstallRequestId = data.uninstallRequestId;
        submitBody.uninstallSignature = uninstallSigned.signature;
        submitBody.uninstallWebauthn = uninstallSigned.webauthn;
      }

      showToast('Sign passkey for ' + name + '...');
      var enableSigned = await signHashWithPasskey(data.enableHash);
      submitBody.enableSignature = enableSigned.signature;
      submitBody.webauthn = enableSigned.webauthn;

      showToast('Submitting ' + name + '...');
      await apiPost('wallet/setup-settlement/submit', submitBody);
    }

    async function setupChain(chain) {
      if (!isProd() || !isAuthenticated) return;
      var name = CHAIN_NAMES[chain] || chain;

      var btns = document.querySelectorAll('#settings-chains-list button');
      var btn = null;
      btns.forEach(function(b) { if (b.getAttribute('onclick') && b.getAttribute('onclick').indexOf(chain) >= 0) btn = b; });
      if (btn) { btn.textContent = 'Setting up...'; btn.disabled = true; }

      try {
        // Step 1: Prepare combined setup (delegate + ECDSA in one UserOp)
        showToast('Preparing settlement on ' + name + '...');
        var data = await apiPost('wallet/setup-settlement', { chain: chain });

        if (data.alreadySetup) {
          showToast(name + ' already configured!');
          loadSettingsPage();
          return;
        }

        var submitBody = { chain: chain };

        // Step 2: If needs uninstall, sign that first
        if (data.needsUninstall) {
          showToast('Sign to uninstall old module on ' + name + '...');
          var uninstallSigned = await signHashWithPasskey(data.uninstallUserOpHash);
          submitBody.uninstallRequestId = data.uninstallRequestId;
          submitBody.uninstallSignature = uninstallSigned.signature;
          submitBody.uninstallWebauthn = uninstallSigned.webauthn;
        }

        // Step 3: Sign enable hash (single passkey signature for everything)
        showToast('Sign with passkey to enable settlement...');
        var enableSigned = await signHashWithPasskey(data.enableHash);
        submitBody.enableSignature = enableSigned.signature;
        submitBody.webauthn = enableSigned.webauthn;

        // Step 4: Submit — backend does delegate + ECDSA enable in one tx
        showToast('Submitting on ' + name + '...');
        await apiPost('wallet/setup-settlement/submit', submitBody);

        showToast(name + ' setup complete!');
        loadSettingsPage();
      } catch (e) {
        showToast('Setup failed: ' + e.message);
        if (btn) { btn.textContent = 'Setup'; btn.disabled = false; }
      }
    }

    /**
     * Sign a hex hash with WebAuthn passkey.
     * Returns { signature: '0x{r}{s}', webauthn: { authenticatorData, clientDataJSON, challengeIndex, typeIndex } }
     * Compatible with Kernel passkey validator format.
     */
    async function signHashWithPasskey(hash) {
      var hexClean = hash.startsWith('0x') ? hash.slice(2) : hash;
      var challenge = hexToBytes(hexClean);

      var publicKeyOptions = {
        challenge: challenge,
        rpId: window.location.hostname,
        userVerification: 'required',
        timeout: 120000,
      };

      // Pre-select the user's credential so browser doesn't show picker
      var credId = CURRENT_USER && CURRENT_USER.credentialId;
      if (credId) {
        var rawId = Uint8Array.from(atob(credId.replace(/-/g, '+').replace(/_/g, '/')), function(c) { return c.charCodeAt(0); });
        publicKeyOptions.allowCredentials = [{ type: 'public-key', id: rawId }];
      }

      var assertion = await navigator.credentials.get({ publicKey: publicKeyOptions });

      // Convert DER signature to r||s (64 bytes each, zero-padded)
      var derSig = new Uint8Array(assertion.response.signature);
      var rs = derToRS(derSig);
      var sigHex = '0x' + bytesToHex(rs.r, 32) + bytesToHex(rs.s, 32);

      // authenticatorData as hex
      var authDataHex = '0x' + bytesToHex(new Uint8Array(assertion.response.authenticatorData));

      // clientDataJSON as string
      var clientDataStr = new TextDecoder().decode(assertion.response.clientDataJSON);

      // Find challengeIndex and typeIndex in clientDataJSON
      var challengeIndex = clientDataStr.indexOf('"challenge"');
      var typeIndex = clientDataStr.indexOf('"type"');

      return {
        signature: sigHex,
        webauthn: {
          authenticatorData: authDataHex,
          clientDataJSON: clientDataStr,
          challengeIndex: challengeIndex,
          typeIndex: typeIndex,
        }
      };
    }

    /** Parse DER-encoded ECDSA signature into r, s Uint8Arrays */
    function derToRS(der) {
      // DER: 0x30 [len] 0x02 [rLen] [r...] 0x02 [sLen] [s...]
      var offset = 2; // skip 0x30 + total length
      if (der[0] !== 0x30) throw new Error('Invalid DER signature');

      // R
      if (der[offset] !== 0x02) throw new Error('Invalid DER: expected 0x02 for R');
      offset++;
      var rLen = der[offset]; offset++;
      var r = der.slice(offset, offset + rLen);
      offset += rLen;
      // Strip leading zero if present (DER pads positive ints)
      if (r[0] === 0x00 && r.length > 32) r = r.slice(1);

      // S
      if (der[offset] !== 0x02) throw new Error('Invalid DER: expected 0x02 for S');
      offset++;
      var sLen = der[offset]; offset++;
      var s = der.slice(offset, offset + sLen);
      if (s[0] === 0x00 && s.length > 32) s = s.slice(1);

      return { r: r, s: s };
    }

    /** Convert Uint8Array to hex string, zero-padded to targetLen bytes */
    function bytesToHex(bytes, targetLen) {
      var hex = '';
      for (var i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }
      if (targetLen) {
        hex = hex.padStart(targetLen * 2, '0');
      }
      return hex;
    }

    function hexToBytes(hex) {
      var bytes = new Uint8Array(hex.length / 2);
      for (var i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      return bytes.buffer;
    }

    // ============================================
    // PAYOUT — INIT
    // ============================================
    window.addEventListener('DOMContentLoaded', function() {
      payoutRenderRecipients();
      payoutUpdateSummary();
      historyInitTabs();
      historyInitIcons();
      historyRenderTransactions();
    });
