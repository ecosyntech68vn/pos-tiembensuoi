// ============================================================================
// pos-enhance.js — POS UI enhancement V2.6 (CEO_THUAN audit)
// ----------------------------------------------------------------------------
// 1. Mặc định chọn category đầu (catFilter=1) khi vào POS Bán hàng — tránh
//    render 114 cards cùng lúc gây lag/render lỗi.
// 2. Thêm pagination 24/trang khi user chọn "Tất cả" (catFilter=0).
// 3. Thêm nút "🔄 Làm tươi" nhỏ vào breadcrumb để re-seed FULL data từ CSV.
// ----------------------------------------------------------------------------
// CÁCH BẬT: thêm vào index.html cuối <body>:
//   <script src="assets/pos-enhance.js"></script>
// ============================================================================
(function () {
  'use strict';
  const PAGE_SIZE = 24;
  const DEFAULT_CAT = 1;  // 1 = Trà hoa quả

  function waitAlpine(cb, retries = 30) {
    if (window.Alpine && document.querySelector('[x-data="posApp()"]')) return cb();
    if (retries <= 0) return console.warn('[pos-enhance] Alpine not ready');
    setTimeout(() => waitAlpine(cb, retries - 1), 200);
  }

  waitAlpine(function () {
    const root = document.querySelector('[x-data="posApp()"]');
    const d = window.Alpine.$data(root);

    // ---- 1. Auto-select category 1 nếu đang ở "Tất cả" (0) ----
    if (d.catFilter === 0 || d.catFilter == null) {
      d.catFilter = DEFAULT_CAT;
    }

    // ---- 2. Pagination khi user chọn "Tất cả" ----
    if (!d.__paginationPatched && typeof d.filteredProducts === 'function') {
      d.currentPage = 1;
      const origFiltered = d.filteredProducts.bind(d);
      d.filteredProducts = function () {
        const arr = origFiltered() || [];
        if (this.catFilter !== 0) return arr;       // Filter theo cat → KHÔNG paginate
        const start = (this.currentPage - 1) * PAGE_SIZE;
        return arr.slice(start, start + PAGE_SIZE);
      };
      d.totalPages = function () {
        if (this.catFilter !== 0) return 1;
        const arr = origFiltered() || [];
        return Math.max(1, Math.ceil(arr.length / PAGE_SIZE));
      };
      d.gotoPage = function (n) {
        const t = this.totalPages();
        this.currentPage = Math.max(1, Math.min(n, t));
      };
      d.__paginationPatched = true;
    }

    // ---- 3. Reset currentPage về 1 khi đổi category ----
    let _cat = d.catFilter;
    Object.defineProperty(d, 'catFilter', {
      get() { return _cat; },
      set(v) { _cat = v; if (d.currentPage) d.currentPage = 1; },
      configurable: true,
    });

    // ---- 4. Inject Pagination UI sau grid sản phẩm ----
    function injectPagination() {
      const sentry = document.getElementById('__pagi_sentry');
      if (sentry) return;  // đã inject

      // Tìm "Bán hàng" container — section header có text "Chọn sản phẩm và thanh toán"
      const banHangHeader = Array.from(document.querySelectorAll('h1, h2, h3, .title, [class*="title"]'))
        .find(el => /Bán hàng/i.test(el.textContent.trim()) && el.textContent.length < 30);
      const banHangSection = banHangHeader?.closest('section, [class*="section"], main') || banHangHeader?.parentElement?.parentElement;
      if (!banHangSection) return;

      // Tạo nav pagination + nút Làm tươi
      const wrap = document.createElement('div');
      wrap.id = '__pagi_sentry';
      wrap.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:center;padding:16px 0;flex-wrap:wrap;';
      wrap.innerHTML = `
        <button id="__pagi_prev" class="btn" style="padding:6px 12px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">←</button>
        <span id="__pagi_label" style="font-size:14px;color:#475569;min-width:80px;text-align:center;">Trang 1/1</span>
        <button id="__pagi_next" class="btn" style="padding:6px 12px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">→</button>
        <span style="flex:1;"></span>
        <button id="__refresh_btn" title="Re-seed FULL menu Tiệm Bên Suối" style="padding:6px 14px;border:1px solid #15803d;border-radius:6px;background:#15803d;color:#fff;cursor:pointer;font-weight:600;">🔄 Làm tươi</button>
      `;
      banHangSection.appendChild(wrap);

      const label = wrap.querySelector('#__pagi_label');
      const prev = wrap.querySelector('#__pagi_prev');
      const next = wrap.querySelector('#__pagi_next');
      const refreshBtn = wrap.querySelector('#__refresh_btn');

      function updateLabel() {
        const t = d.totalPages();
        const c = d.currentPage || 1;
        label.textContent = (d.catFilter === 0) ? `Trang ${c}/${t}` : `Đang lọc theo nhóm`;
        prev.disabled = d.catFilter !== 0 || c <= 1;
        next.disabled = d.catFilter !== 0 || c >= t;
        prev.style.opacity = prev.disabled ? '0.4' : '1';
        next.style.opacity = next.disabled ? '0.4' : '1';
      }
      prev.addEventListener('click', () => { d.gotoPage((d.currentPage || 1) - 1); setTimeout(updateLabel, 50); });
      next.addEventListener('click', () => { d.gotoPage((d.currentPage || 1) + 1); setTimeout(updateLabel, 50); });
      refreshBtn.addEventListener('click', () => {
        if (!confirm('Xoá toàn bộ dữ liệu hiện tại và nạp lại 114 SKU Tiệm Bên Suối từ CSV?\n\nDùng khi POS bị mất sản phẩm hoặc dùng máy mới.')) return;
        location.href = location.pathname.replace(/\/[^/]*$/, '/') + 'tools/reseed-tiembensuoi.html';
      });

      // Update label periodically + when state changes
      setInterval(updateLabel, 800);
      updateLabel();
    }

    // Inject lần đầu + watch DOM thay đổi (khi user click nav khác rồi quay lại POS)
    setTimeout(injectPagination, 500);
    new MutationObserver(() => { setTimeout(injectPagination, 300); }).observe(document.body, { childList: true, subtree: true });

    console.log('[pos-enhance] V2.6 patched: default cat 1 + pagination ' + PAGE_SIZE + '/page + Làm tươi button');
  });
})();
