const { contextBridge } = require('electron');

function getGatewayBaseUrl() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('gatewayBaseUrl') || 'http://127.0.0.1:5271';
  } catch (error) {
    return 'http://127.0.0.1:5271';
  }
}

contextBridge.exposeInMainWorld('gatewayDesktop', {
  getGatewayBaseUrl,
});
