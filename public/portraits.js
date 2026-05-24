/**
 * Hougong Fengyun - 6 character class portraits (SVG)
 *
 * Usage:
 *   window.PORTRAITS[classId]            -> raw SVG string
 *   window.renderPortrait(classId, size) -> wrapped HTML
 *
 * Override with real artwork:
 *   Drop a same-named PNG into public/portraits/<classId>.png
 *   (default / talent / seductress / schemer / noble / healer)
 *   renderPortrait will prefer the PNG and fall back to inline SVG on 404.
 *
 * viewBox 100x140, half-body front view with subtle sway animation.
 */
(function () {
  function person(opts) {
    var robe = opts.robe;
    var robeDark = opts.robeDark;
    var sash = opts.sash;
    var lip = opts.lip || '#b21d3a';
    var hair = opts.hair || '#0a0a0a';
    var cheek = opts.cheek || '#e89090';
    var headHTML = opts.head || '';
    var propHTML = opts.prop || '';
    var extraHTML = opts.extra || '';
    return '' +
'<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" class="portrait-svg" aria-hidden="true">' +
'<defs><linearGradient id="rb-' + opts.id + '" x1="0" y1="0" x2="0" y2="1">' +
'<stop offset="0" stop-color="' + robe + '"/><stop offset="1" stop-color="' + robeDark + '"/>' +
'</linearGradient></defs>' +
'<g class="p-robe">' +
'<path d="M22 88 Q50 80 78 88 L88 138 L12 138 Z" fill="url(#rb-' + opts.id + ')" stroke="' + robeDark + '" stroke-width="0.8"/>' +
'<path d="M50 88 L50 138" stroke="' + robeDark + '" stroke-width="0.6" opacity="0.5"/>' +
'<path d="M40 78 Q50 88 60 78 L60 70 L40 70 Z" fill="#fbe9c2" stroke="' + robeDark + '" stroke-width="0.5"/>' +
'<path class="p-sash" d="M30 92 Q50 100 70 92 L72 108 Q50 115 28 108 Z" fill="' + sash + '" opacity="0.85"/>' +
'</g>' +
'<path d="M44 70 L44 78 L56 78 L56 70 Z" fill="#fbe2c8"/>' +
'<g class="p-head">' +
'<path d="M28 42 Q28 22 50 18 Q72 22 72 42 L72 64 Q50 70 28 64 Z" fill="' + hair + '"/>' +
'<ellipse cx="50" cy="48" rx="18" ry="22" fill="#fbe2c8"/>' +
'<path d="M34 36 Q50 26 66 36 Q60 42 50 40 Q40 42 34 36 Z" fill="' + hair + '"/>' +
'<path d="M40 44 Q43 42 46 44" stroke="#2b1810" stroke-width="1" fill="none" stroke-linecap="round"/>' +
'<path d="M54 44 Q57 42 60 44" stroke="#2b1810" stroke-width="1" fill="none" stroke-linecap="round"/>' +
'<ellipse class="p-eye" cx="42" cy="50" rx="1.6" ry="2.2" fill="#2b1810"/>' +
'<ellipse class="p-eye" cx="58" cy="50" rx="1.6" ry="2.2" fill="#2b1810"/>' +
'<ellipse cx="38" cy="56" rx="3" ry="1.6" fill="' + cheek + '" opacity="0.55"/>' +
'<ellipse cx="62" cy="56" rx="3" ry="1.6" fill="' + cheek + '" opacity="0.55"/>' +
'<path d="M46 60 Q50 63 54 60 Q50 58 46 60 Z" fill="' + lip + '"/>' +
headHTML +
'</g>' +
propHTML +
extraHTML +
'</svg>';
  }

  var PORTRAITS = {
    'default': person({
      id: 'default',
      robe: '#f4c4d4', robeDark: '#c98aa3', sash: '#ffd9e0',
      head:
        '<g class="p-hairpin">' +
        '<circle cx="68" cy="34" r="3" fill="#f8a5b8"/>' +
        '<circle cx="72" cy="32" r="2" fill="#f8a5b8"/>' +
        '<circle cx="66" cy="30" r="2" fill="#fff"/>' +
        '<circle cx="70" cy="36" r="1.8" fill="#fff"/>' +
        '</g>'
    }),

    talent: person({
      id: 'talent',
      robe: '#8fb8d6', robeDark: '#5a7e9c', sash: '#cbe1f0',
      head:
        '<g class="p-hairpin">' +
        '<line x1="60" y1="28" x2="80" y2="22" stroke="#dfead4" stroke-width="1.4"/>' +
        '<circle cx="80" cy="22" r="2.2" fill="#a9d18e"/>' +
        '</g>',
      prop:
        '<g class="p-prop">' +
        '<rect x="68" y="92" width="18" height="22" rx="2" fill="#f0d9aa" stroke="#8b6a3d" stroke-width="0.8"/>' +
        '<line x1="71" y1="98" x2="83" y2="98" stroke="#8b6a3d" stroke-width="0.6"/>' +
        '<line x1="71" y1="103" x2="83" y2="103" stroke="#8b6a3d" stroke-width="0.6"/>' +
        '<line x1="71" y1="108" x2="80" y2="108" stroke="#8b6a3d" stroke-width="0.6"/>' +
        '</g>'
    }),

    seductress: person({
      id: 'seductress',
      robe: '#c2293a', robeDark: '#7a1622', sash: '#ffd278', lip: '#c2293a',
      head:
        '<g class="p-hairpin">' +
        '<path d="M70 30 Q75 22 80 26 Q78 32 72 33 Z" fill="#ffd278" stroke="#8b6a3d" stroke-width="0.4"/>' +
        '<path d="M70 32 Q66 30 64 26 Q70 24 72 30 Z" fill="#c2293a" stroke="#7a1622" stroke-width="0.4"/>' +
        '</g>',
      extra: '<circle cx="50" cy="40" r="1.5" fill="#c2293a"/>'
    }),

    schemer: person({
      id: 'schemer',
      robe: '#6b4470', robeDark: '#3d2747', sash: '#b890c2',
      head:
        '<g class="p-hairpin">' +
        '<line x1="60" y1="28" x2="78" y2="20" stroke="#d4d4d4" stroke-width="1.4"/>' +
        '<path d="M76 18 Q80 18 80 22 Q78 22 76 20 Z" fill="#c0c0c0"/>' +
        '</g>',
      prop:
        '<g class="p-prop">' +
        '<ellipse cx="80" cy="100" rx="9" ry="11" fill="#fbe9c2" stroke="#8b6a3d" stroke-width="0.8"/>' +
        '<line x1="80" y1="100" x2="80" y2="118" stroke="#8b6a3d" stroke-width="1.4"/>' +
        '<path d="M76 96 Q80 92 84 96" stroke="#c2293a" stroke-width="0.8" fill="none"/>' +
        '<circle cx="80" cy="100" r="1.5" fill="#c2293a"/>' +
        '</g>'
    }),

    noble: person({
      id: 'noble',
      robe: '#e8b84f', robeDark: '#a07a1f', sash: '#c2293a',
      head:
        '<g class="p-hairpin">' +
        '<path d="M32 30 L50 16 L68 30 Z" fill="#ffd278" stroke="#8b6a3d" stroke-width="0.6"/>' +
        '<circle cx="50" cy="20" r="2.2" fill="#c2293a" stroke="#7a1622" stroke-width="0.4"/>' +
        '<circle cx="40" cy="26" r="1.4" fill="#c2293a"/>' +
        '<circle cx="60" cy="26" r="1.4" fill="#c2293a"/>' +
        '<line x1="35" y1="30" x2="35" y2="38" stroke="#ffd278" stroke-width="0.6"/>' +
        '<line x1="65" y1="30" x2="65" y2="38" stroke="#ffd278" stroke-width="0.6"/>' +
        '<circle cx="35" cy="39" r="1" fill="#ffd278"/>' +
        '<circle cx="65" cy="39" r="1" fill="#ffd278"/>' +
        '</g>'
    }),

    healer: person({
      id: 'healer',
      robe: '#8ab977', robeDark: '#4f7541', sash: '#e1edcf',
      head:
        '<g class="p-hairpin">' +
        '<line x1="60" y1="30" x2="78" y2="24" stroke="#8b6a3d" stroke-width="1.4"/>' +
        '<path d="M76 23 L82 21 L82 26 L77 27 Z" fill="#a9d18e"/>' +
        '</g>',
      prop:
        '<g class="p-prop">' +
        '<path d="M72 94 Q72 90 76 90 L82 90 Q86 90 86 94 L86 108 Q86 112 82 112 L76 112 Q72 112 72 108 Z" fill="#c8e6c8" stroke="#4f7541" stroke-width="0.8"/>' +
        '<path d="M75 92 Q79 88 83 92" stroke="#4f7541" stroke-width="0.8" fill="none"/>' +
        '<line x1="79" y1="97" x2="79" y2="105" stroke="#4f7541" stroke-width="1"/>' +
        '<line x1="75" y1="101" x2="83" y2="101" stroke="#4f7541" stroke-width="1"/>' +
        '</g>'
    })
  };

  window.PORTRAITS = PORTRAITS;

  // ============================================================
  // 头像焦点配置（仅 single 模式有效）
  // 每张大卡 500×439。人脸大致 x 百分比（图自身宽度的 0~100）
  // 由 mini-portrait 在 pcard 里取头部时用 object-position + scale
  // ============================================================
  var FOCUS = {
    'default':    { x: 58, y: 32, s: 2.4 }, // 良家：人物中央偏右
    talent:       { x: 70, y: 28, s: 2.4 }, // 才女：人物偏右
    seductress:   { x: 40, y: 32, s: 2.4 }, // 妖姬：人物偏左
    schemer:      { x: 70, y: 28, s: 2.4 }, // 心机：人物偏右
    noble:        { x: 38, y: 32, s: 2.4 }, // 嫡女：人物偏左
    healer:       { x: 60, y: 30, s: 2.4 }  // 神医：人物中央偏右
  };
  window.PORTRAIT_FOCUS = FOCUS;

  // class id -> sprite column index in sheet.png (0-based, left to right)
  var SPRITE_INDEX = {
    'default': 0, talent: 1, seductress: 2, schemer: 3, noble: 4, healer: 5
  };
  var SPRITE_COLS = 6;
  // height-to-width ratio of one column in the sheet.
  // The 6-girl AI sheet (~1024x682) gives each column ~1:4. Tune as needed.
  var SPRITE_RATIO = 4.0;
  // height-to-width ratio for individual per-class cropped card PNG/JPG assets.
  var SINGLE_RATIO = 357 / 480;
  var ASSET_VERSION = 'v42';

  // Mode detection: 'single' (per-class PNGs) > 'sprite' (sheet.png) > 'svg'
  window.PORTRAIT_MODE = 'svg';
  window.portraitsReady = (function () {
    function head(url) {
      return fetch(url, { method: 'HEAD' }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }
    return head('portraits/default.jpg').then(function (ok) {
      if (ok) { window.PORTRAIT_MODE = 'single'; return; }
      return head('portraits/default.png').then(function (ok2) {
        if (ok2) { window.PORTRAIT_MODE = 'single'; return; }
        return head('portraits/sheet.png').then(function (ok3) {
          if (ok3) window.PORTRAIT_MODE = 'sprite';
        });
      });
    });
  })();

  /**
   * Render a portrait HTML chunk.
   * @param {string} classId
   * @param {number} size  display width in px
   * @returns {string}
   */
  window.renderPortrait = function (classId, size, opts) {
    var id = (classId && PORTRAITS[classId]) ? classId : 'default';
    opts = opts || {};
    var fill = !!opts.fillParent;
    size = size || 64;
    var mode = window.PORTRAIT_MODE || 'svg';
    var defaultRatio = mode === 'sprite' ? SPRITE_RATIO :
                       mode === 'single' ? SINGLE_RATIO : 1.4;
    var sizeStyle = fill ? 'width:100%;height:100%;' :
      ('width:' + size + 'px;height:' + Math.round(size * defaultRatio) + 'px;');

    if (mode === 'sprite') {
      var colIdx = SPRITE_INDEX[id] != null ? SPRITE_INDEX[id] : 0;
      var posX = (SPRITE_COLS === 1) ? 0 : (colIdx / (SPRITE_COLS - 1)) * 100;
      return '<div class="portrait sprite-portrait" data-cls="' + id + '" style="' + sizeStyle + '">' +
        '<div class="sprite-frame" style="background-position:' + posX + '% center;"></div>' +
        '<span class="petal p1">🌸</span>' +
        '<span class="petal p2">🌸</span>' +
        '<span class="petal p3">🌸</span>' +
        '</div>';
    }

    if (mode === 'single') {
      // 优先用压缩 JPG（~45KB），如果 404 浏览器会显示空，PNG fallback 由 onerror 切回
      var imgUrl = 'portraits/' + id + '.jpg?' + ASSET_VERSION;
      var imgStyle = 'width:100%;height:100%;object-fit:contain;border-radius:4px;';
      if (opts.headOnly) {
        imgUrl = 'portraits/heads/' + id + '.jpg?' + ASSET_VERSION;
        imgStyle = 'width:100%;height:100%;object-fit:cover;border-radius:0;';
      }
      // JPG 加载失败时自动回退到 PNG（兼容旧服务器）
      var fallback = 'this.onerror=null;this.src=\'portraits/' + id + '.png?' + ASSET_VERSION + '\'';
      return '<div class="portrait" style="' + sizeStyle + '">' +
        '<img class="portrait-img" src="' + imgUrl + '" alt="" loading="lazy" '
          + 'onerror="' + fallback + '" '
          + 'style="' + imgStyle + '"/>' +
        (opts.headOnly ? '' :
          '<span class="petal p1">🌸</span><span class="petal p2">🌸</span><span class="petal p3">🌸</span>') +
        '</div>';
    }
    // svg fallback (1:1.4)
    var svgSize = fill ? 'width:100%;height:100%;' :
      ('width:' + size + 'px;height:' + Math.round(size * 1.4) + 'px;');
    return '<div class="portrait" style="' + svgSize + '">' +
      '<div class="portrait-fallback" style="width:100%;height:100%;">' + PORTRAITS[id] + '</div>' +
      '</div>';
  };
})();
