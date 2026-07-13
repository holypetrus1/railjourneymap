const segmentCard = document.querySelector('#add-segment-card');
const addButton = document.querySelector('#add-segment-button');
const capacity = document.querySelector('#segment-capacity');

function syncAddButton() {
  if (!segmentCard || !addButton) return;
  const used = Number.parseInt(capacity?.textContent ?? '0', 10) || 0;
  addButton.disabled = segmentCard.hidden || used >= 10;
}

if (segmentCard && addButton) {
  new MutationObserver(syncAddButton).observe(segmentCard, {
    attributes: true,
    attributeFilter: ['hidden'],
  });
  if (capacity) {
    new MutationObserver(syncAddButton).observe(capacity, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  syncAddButton();
}
