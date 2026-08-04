/* Minimal GLSL / C++ syntax highlighter (regex based, no deps) */

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const KEYWORD_AS_ALIAS = /(?:gl_|GL_)/;

export function highlight(src) {
  let out = escapeHtml(src);
  const stash = [];
  const guard = (re, cls) => {
    out = out.replace(re, (m) => {
      const i = stash.push(`<span class="${cls}">${m}</span>`) - 1;
      return `\u0000${i}\u0000`;
    });
  };

  // 先保护注释 / 预处理器 / 字符串，避免后续规则嵌套污染
  guard(/\/\/[^\n]*/g, 'c-comment');
  guard(/\/\*[\s\S]*?\*\//g, 'c-comment');
  guard(/#[^\n]*/g, 'c-pre');
  guard(/'(?:\\.|[^'\\])*'/g, 'c-str');
  guard(/"(?:\\.|[^"\\])*"/g, 'c-str');

  out = out.replace(/\b(?:0x[0-9a-fA-F]+|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)\b/g, (m) => `<span class="c-num">${m}</span>`);
  out = out.replace(
    /\b(?:uniform|in|out|inout|void|return|if|else|for|while|break|continue|const|struct|true|false|static|using|namespace|class|public|private|include|pragma|version)\b/g,
    (m) => `<span class="c-keyword">${m}</span>`
  );
  out = out.replace(
    /\b(?:vec[234]|mat[234]|sampler2D|int|uint|float|double|bool|char|size_t|uint8_t|uint16_t|uint32_t|uint64_t|int32_t|int16_t|uint16_t)\b/g,
    (m) => `<span class="c-type">${m}</span>`
  );

  // 函数调用
  out = out.replace(/\b([A-Za-z_]\w*)(?=\()/g, (m) => (KEYWORD_AS_ALIAS.test(m) ? m : `<span class="c-fn">${m}</span>`));

  // 恢复被保护的片段
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
  return out;
}

export function initCodeBlocks(root = document) {
  root.querySelectorAll('pre code').forEach((el) => {
    if (el.dataset.hl) return;
    el.dataset.hl = '1';
    el.innerHTML = highlight(el.textContent);
  });
}
