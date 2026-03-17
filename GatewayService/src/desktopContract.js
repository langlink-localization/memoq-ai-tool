const fs = require('fs');
const path = require('path');

const contractCandidates = [
  path.resolve(__dirname, '../../shared-contracts/desktop-contract.json'),
  path.resolve(__dirname, '../shared-contracts/desktop-contract.json'),
  path.join(process.resourcesPath || '', 'desktop-contract.json'),
  path.join(process.resourcesPath || '', 'shared-contracts', 'desktop-contract.json'),
];

const contractPath = contractCandidates.find((candidate) => fs.existsSync(candidate));

if (!contractPath) {
  throw new Error('desktop-contract.json not found');
}

const contract = require(contractPath);

module.exports = {
  PRODUCT_NAME: contract.productName,
  CONTRACT_VERSION: String(contract.contractVersion),
  DEFAULT_HOST: contract.defaultHost,
  DEFAULT_PORT: Number(contract.defaultPort),
  ROUTES: contract.routes,
  INTEGRATION: contract.integration,
  ERROR_CODES: contract.errorCodes,
  raw: contract,
};
