import {request} from "./promisifiedRequests";
import {Blockchain, MininumConfirmations, Status, Url, VerifierError} from "../config/default";
import {TransactionData} from "./verifierModels";

export function getEtherScanFetcher(transactionId, chain) {
  const action = "&action=eth_getTransactionByHash&txhash=";
  let etherScanUrl;
  if (chain === Blockchain.ethmain) {
    etherScanUrl = Url.etherScanMainUrl + action + transactionId;
  } else {
    etherScanUrl = Url.etherScanRopstenUrl + action + transactionId;
  }

  let etherScanFetcher = new Promise((resolve, reject) => {
    return request({url: etherScanUrl})
      .then(function (response) {
        const responseTxData = JSON.parse(response);
        try {
          // Parse block to get timestamp first, then create TransactionData
          let blockFetcher = getEtherScanBlock(responseTxData, chain);
          blockFetcher
            .then(function (blockResponse) {
              const txData = parseEtherScanResponse(responseTxData, blockResponse);
              resolve(txData);
            })
            .catch(function (err) {
              reject(new VerifierError(Status.fetchingRemoteHash, `Unable to get remote hash`));
            });
        } catch (err) {
          // don't need to wrap this exception
          reject(new VerifierError(Status.fetchingRemoteHash, `Unable to get remote hash`));
        }
      }).catch(function (err) {
        reject(new VerifierError(Status.fetchingRemoteHash, `Unable to get remote hash`));
      });
  });
  return etherScanFetcher;
}

function parseEtherScanResponse(jsonResponse, block) {
  const data = jsonResponse.result;
  const date = new Date(parseInt(block.timestamp, 16) * 1000);
  const issuingAddress = data.from;
  const opReturnScript = cleanupRemoteHash(data.input); // remove '0x'

  // The method of checking revocations by output spent do not work with Ethereum.
  // There are no input/outputs, only balances.
  return new TransactionData(opReturnScript, issuingAddress, date, undefined);
}

function getEtherScanBlock(jsonResponse, chain) {
  const data = jsonResponse.result;
  const blockNumber = data.blockNumber;
  const action = "&action=eth_getBlockByNumber&boolean=true&tag=";
  let etherScanUrl;
  if (chain === Blockchain.ethmain) {
    etherScanUrl = Url.etherScanMainUrl + action + blockNumber;
  } else {
    etherScanUrl = Url.etherScanRopstenUrl + action + blockNumber;
  }

  return new Promise((resolve, reject) => {
    return request({url: etherScanUrl})
      .then(function (response) {
        const responseData = JSON.parse(response);
        const blockData = responseData.result;
        try {
          let checkConfirmationsFetcher = checkEtherScanConfirmations(chain, blockNumber);
          checkConfirmationsFetcher
            .then(function () {
              resolve(blockData);
            }).catch(function (err) {
              reject(new VerifierError(Status.fetchingRemoteHash, `Unable to get remote hash`));
          });
        } catch (err) {
          // don't need to wrap this exception
          reject(new VerifierError(Status.fetchingRemoteHash, `Unable to get remote hash`));
        }
      }).catch(function (err) {
        reject(new VerifierError(Status.fetchingRemoteHash, `Unable to get remote hash`));
      });
  });
}

function checkEtherScanConfirmations(chain, blockNumber){
  const action = "&action=eth_blockNumber";
  let etherScanUrl;
  if (chain === Blockchain.ethmain) {
    etherScanUrl = Url.etherScanMainUrl + action;
  } else {
    etherScanUrl = Url.etherScanRopstenUrl + action;
  }

  return new Promise((resolve, reject) => {
    return request({url: etherScanUrl})
      .then(function (response) {
        const responseData = JSON.parse(response);
        const currentBlockCount = responseData.result;
        try {
          if (currentBlockCount - blockNumber < MininumConfirmations) {
            reject(new VerifierError(Status.fetchingRemoteHash, `Number of transaction confirmations were less than the minimum required, according to EtherScan API`));
          }
          resolve(currentBlockCount);
        } catch (err) {
          // don't need to wrap this exception
          reject(new VerifierError(Status.fetchingRemoteHash, `Unable to get remote hash`));
        }
      }).catch(function (err) {
        reject(new VerifierError(Status.fetchingRemoteHash, `Unable to get remote hash`));
      });
  });
}

function cleanupRemoteHash(remoteHash) {
  let prefix = "0x";
  if (startsWith(remoteHash, prefix)) {
    return remoteHash.slice(prefix.length);
  }
  return remoteHash;
}