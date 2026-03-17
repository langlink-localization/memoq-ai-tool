function buildGatewayBaseUrl(host, port) {
  return `http://${host}:${port}/`;
}

module.exports = {
  buildGatewayBaseUrl,
};
