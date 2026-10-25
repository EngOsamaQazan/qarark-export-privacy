async function enableSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error(error);
  }
}

enableSidePanel();

chrome.runtime.onInstalled.addListener(() => {
  enableSidePanel();
});
