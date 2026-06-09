// ============================================================================
// pos-enhance.js — POS UI enhancement V2.6.1 (CEO_THUAN audit)
// Simple, safe — KHÔNG dùng Object.defineProperty + KHÔNG MutationObserver.
// 1. Auto-select category 1 (Trà hoa quả) khi vào POS Bán hàng
// 2. Pagination 24/page khi user chọn "Tất cả" (catFilter=0)
// 3. Nút "🔄 Làm tươi" inject vào header
// ============================================================================
(function () {
  'use strict';
  const PAGE_SIZE = 24;

  function tryPatch() {
    if (!window.Alpine) return false;
    const root = document.querySelector('[x-data="posApp()"]');
    if (!root) return false;
    let d;
    try { d = window.Alpine.$data(root); } catch (e) { return false; }
    if (!d || typeof d.filteredProducts !== 'function') return false;
    if (d.__enhanced) return true;

    // 1. Default category 1
    if (d.catFilter === 0 || d.catFilter == null) d.catFilter = 1;

    // 2. Add currentPage + wrap filteredProducts với pagination
    d.currentPage = 1;
    const orig = d.filteredProducts.bind(d);
    d.filteredProducts = function () {
      const arr = orig() || [];
      if (this.catFilter !== 0) return arr;
      const p = this.currentPage || 1;
      return arr.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    };
    d.totalPages = function () {
      if (this.catFilter !== 0) return 1;
      const arr = orig() || [];
      return Math.max(1, Math.ceil(arr.length / PAGE_SIZE));
    };
    d.gotoPage = function (n) {
      const t = this.totalPages();
      this.currentPage = Math.max(1, Math.min(n, t));
    };
    d.__enhanced = true;
    d.__lastCat = d.catFilter;

    // Watch catFilter change qua interval (an toàn hơn defineProperty)
    setInterval(() => {
      if (d.__lastCat !== d.catFilter) {
        d.currentPage = 1;
        d.__lastCat = d.catFilter;
      }
    }, 300);

    console.log('[pos-enhance V2.6.1] patched: cat=1, pagination ' + PAGE_SIZE + '/page');
    return true;
  }

  function tryInjectUI() {
    if (document.getElementById('__pagi_sentry')) return true;
    const root = document.querySelector('[x-data="posApp()"]');
    if (!root || !window.Alpine) return false;
    let d;
    try { d = window.Alpine.$data(root); } catch (e) { return false; }
    if (!d || !d.__enhanced) return false;

    // Tìm khu vực "Bán hàng" — chỉ inject khi user đang xem POS section
    const banHangHeader = Array.from(document.querySelectorAll('h1, h2, h3'))
      .find(el => el.offsetParent && /^Bán hàng$/.test(el.textContent.trim()));
    if (!banHangHeader) return false;

    // Container parent của heading
    const container = banHangHeader.closest('section, main, .pos-section') || banHangHeader.parentElement?.parentElement || banHangHeader.parentElement;
    if (!container) return false;

    const wrap = document.createElement('div');
    wrap.id = '__pagi_sentry';
    wrap.style.cssText = 'display:flex;gap:8px;align-items:center;padding:12px 0;flex-wrap:wrap;border-top:1px solid #e2e8f0;margin-top:12px;';
    wrap.innerHTML = '' +
      '<button id="__pagi_prev" style="padding:6px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">← Trang trước</button>' +
      '<span id="__pagi_label" style="font-size:14px;color:#475569;min-width:90px;text-align:center;">Trang 1/1</span>' +
      '<button id="__pagi_next" style="padding:6px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Trang sau →</button>' +
      '<span style="flex:1;"></span>' +
      '<button id="__refresh_btn" title="Re-seed FULL menu Tiệm Bên Suối" style="padding:8px 18px;border:0;border-radius:8px;background:#15803d;color:#fff;cursor:pointer;font-weight:600;font-size:14px;">🔄 Làm tươi menu</button>';
    container.appendChild(wrap);

    const label = wrap.querySelector('#__pagi_label');
    const prev = wrap.querySelector('#__pagi_prev');
    const next = wrap.querySelector('#__pagi_next');
    const refresh = wrap.querySelector('#__refresh_btn');

    function refreshLabel() {
      const t = d.totalPages();
      const c = d.currentPage || 1;
      label.textContent = (d.catFilter === 0) ? ('Trang ' + c + '/' + t) : 'Chọn nhóm';
      prev.disabled = d.catFilter !== 0 || c <= 1;
      next.disabled = d.catFilter !== 0 || c >= t;
      prev.style.opacity = prev.disabled ? '0.4' : '1';
      next.style.opacity = next.disabled ? '0.4' : '1';
    }
    prev.addEventListener('click', function () { d.gotoPage((d.currentPage || 1) - 1); setTimeout(refreshLabel, 80); });
    next.addEventListener('click', function () { d.gotoPage((d.currentPage || 1) + 1); setTimeout(refreshLabel, 80); });
    refresh.addEventListener('click', function () {
      if (!confirm('Xoá DB hiện tại và nạp lại 114 SKU Tiệm Bên Suối?\n\nDùng khi POS mất sản phẩm hoặc dùng máy mới.')) return;
      location.href = location.pathname.replace(/[^/]*$/, '') + 'tools/reseed-tiembensuoi.html';
    });

    setInterval(refreshLabel, 800);
    refreshLabel();
    console.log('[pos-enhance V2.6.1] UI injected');
    return true;
  }

  // Patch sau khi Alpine ready, retry mỗi 400ms cho đến khi xong
  const patchTimer = setInterval(function () {
    if (tryPatch()) clearInterval(patchTimer);
  }, 400);

  // Inject UI: retry mỗi 800ms — cần đợi user click "POS Bán hàng" thì header mới xuất hiện
  setInterval(tryInjectUI, 800);
})();
