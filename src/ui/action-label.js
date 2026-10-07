// 操作ラベル：操作する場所を細い線で指し、残りの回数や距離だけを静かに示す。
// シーンが派手なぶん、UIはミニマルに。ただし細部（線・余白・字間）は作り込む。
export function createActionLabel(parent) {
  const el = document.createElement('div');
  el.className = 'action';
  el.innerHTML = `<span class="action__dot"></span><span class="action__line"></span><span class="action__label"></span>`;
  el.hidden = true;
  parent.appendChild(el);
  const text = el.querySelector('.action__label');
  return {
    show([x, y], msg) {
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      text.textContent = msg;
      el.hidden = false;
    },
    update(msg) { text.textContent = msg; },
    hide() { el.hidden = true; },
  };
}
