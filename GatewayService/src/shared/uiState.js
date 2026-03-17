(function initMemoQUiState(globalScope) {
  function getInstallationStatusClass(status) {
    if (status === 'installed') return 'ok';
    if (status === 'needs_repair') return 'warn';
    return 'bad';
  }

  function buildIntegrationStatusViewModel(data) {
    const primaryInstallation = Array.isArray(data?.installations) && data.installations.length > 0
      ? data.installations[0]
      : null;

    if (!primaryInstallation) {
      return {
        foundInstallation: false,
      };
    }

    const assetsReady = Boolean(data?.assets?.pluginDllExists && data?.assets?.clientDevConfigExists);

    return {
      foundInstallation: true,
      overallStatus: String(data?.status || 'not_found'),
      requestedMemoQVersion: String(data?.requestedMemoQVersion || '11'),
      customInstallDir: String(data?.customInstallDir || ''),
      installationName: String(primaryInstallation.name || ''),
      installationStatus: String(primaryInstallation.status || 'not_installed'),
      installationStatusClass: getInstallationStatusClass(primaryInstallation.status),
      addinsDir: String(primaryInstallation.addinsDir || ''),
      clientDevConfigTarget: String(primaryInstallation.clientDevConfigTarget || ''),
      assetsReady,
    };
  }

  const api = {
    buildIntegrationStatusViewModel,
    getInstallationStatusClass,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.memoqUiState = api;
})(typeof window !== 'undefined' ? window : globalThis);
