'use strict';

//Cards are added by the overlay process (main.js) with addCard(). Text only via textContent: names/descriptions are never parsed as HTML
const stack = document.getElementById('stack');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

window.addCard = (card) => {
  document.body.className = card.position;

  const toast = el('div', 'toast');

  const iconBox = el('div', 'icon');
  if (card.icon) {
    const img = el('img');
    img.alt = '';
    img.src = card.icon;
    iconBox.append(img);
    toast.append(iconBox);
  }

  const header = el('div', 'header');
  header.append(el('span', 'trophy', '\u{1F3C6}'), ' ', el('span', null, card.header));
  if (card.progress) header.append(el('span', 'progress', card.progress));

  const text = el('div', 'text');
  text.append(header, el('div', 'title', card.title), el('div', 'description', card.description), el('div', 'game', card.game));

  const timer = el('div', 'timer');
  toast.append(text, timer);
  stack.append(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
    timer.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: card.duration, easing: 'linear', fill: 'forwards' });
  });
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 550);
  }, card.duration);
};
