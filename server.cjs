const moneroTs = require("monero-ts");
const api_key = require("./config.js");
const moneroAddress = require("./appconfig.js");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
//var cert = fs.readFileSync('/etc/letsencrypt/live/morphswap.io/fullchain.pem');
//var key = fs.readFileSync('/etc/letsencrypt/live/morphswap.io/privkey.pem');
//var options = { key: key, cert: cert };
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "build")));
let PORT = 3000;
let walletRPC;
const hardCodedXMRFee = 0.02;
//===============================================================
//Endpoints
//===============================================================
//Get
app.get("/getMinAmount", async function (req, res) {
  let minAmount = await getMinAmountFromBTCtoXMR();
  res.send(minAmount);
});
let cache = {};
app.get("/createMoneroWallet", async function (req, res) {
  let ipAddress = req.socket.remoteAddress;
  let timestamp = +new Date();
  console.log({ timestamp });
  if (cache[ipAddress] === undefined) {
    cache[ipAddress] = timestamp;
  } else {
    if (cache[ipAddress] > timestamp - 60000) {
      let address = await createMoneroWallet(ipAddress);
      res.send({ address });
      return;
    } else {
      cache[ipAddress] = timestamp;
    }
  }
  let address = await createMoneroWallet(ipAddress);
  res.send({ address });
});
//Post requests

app.post("/estimate", async function (req, res) {
  let estimated = await estimateRecieved(req.body.amount, req.body.path);
  res.send(estimated);
});
app.post("/transactionStatus", async function (req, res) {
  let statusResult = await getTransactionStatus(req.body.id);
  console.log({ statusResult });
  res.send(statusResult);
});

//===============================================================
//Linked List
//===============================================================
let trackedSwaps = { prev: null, next: null };
let lastNode = null;
const hashToData = {};
const finishedSet = new Set();
function removeNode(node) {
  hashToData[node.hash] = undefined;
  if (node.prev == null && node.next == null) {
    lastNode = null;
  } else if (node.prev == null) {
    node.next.prev = null;
    trackedSwaps = node.next;
  } else if (node.next == null) {
    node.prev.next = null;
    lastNode = node.prev;
  } else {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }
}
function addNode(node) {
  hashToData[node.hash] = node;
  if (lastNode == null) {
    trackedSwaps.data = node;
    lastNode = trackedSwaps;
  } else {
    lastNode.next = { data: node, prev: lastNode, next: null };
    lastNode = lastNode.next;
  }
}

function iterator(curNode) {
  getTransactionStatus(curNode.data.id).then((result) => {
    curNode.data.status = result.status;
    if (result.status === "finished") {
      if (curNode.data.stage === 1) {
        createTX(
          "https://api.changenow.io/v1/transactions/" + api_key,
          result.amountReceive - hardCodedXMRFee,
          curNode.data.userDestBTC,
          "xmr",
          "btc"
        )
          .then((stepResult) => {
            console.log({ stepResult });
            if (stepResult !== undefined && stepResult.payinAddress !== undefined) {
              walletRPC.getUnlockedBalance(0, 2).then((unlockedBalance) => {
                let neededMonero = convertFromFloatToBigIntX10_12(result.amountReceive - hardCodedXMRFee);
                if (unlockedBalance >= neededMonero) {
                  walletRPC
                    .createTx({
                      accountIndex: 0,
                      subaddressIndex: 2,
                      address: stepResult.payinAddress,
                      amount: neededMonero.toString(), //(denominated in atomic units)
                      relay: false, // create transaction and relay to the network if true
                    })
                    .then((createdTx) => walletRPC.relayTx(createdTx))
                    .then((status) => {
                      curNode.data.stage = 2;
                      curNode.data.status = status;
                    });
                } else {
                  curNode.data.stage = 1.5;
                  curNode.data.neededMonero = neededMonero;
                  curNode.data.changeNowXMRAddress = stepResult.payinAddress;
                }
              });
            }
          })
          .catch((err) => {
            console.log("error: ", err);
          });
      } else if (curNode.data.stage === 1.5) {
        walletRPC.getUnlockedBalance(0, 2).then((unlockedBalance) => {
          let neededMonero = convertFromFloatToBigIntX10_12(result.amountReceive - hardCodedXMRFee);
          if (unlockedBalance >= neededMonero) {
            walletRPC
              .createTx({
                accountIndex: 0,
                subaddressIndex: 2,
                address: curNode.data.changeNowXMRAddress,
                amount: neededMonero.toString(), //(denominated in atomic units)
                relay: false, // create transaction and relay to the network if true
              })
              .then((createdTx) => walletRPC.relayTx(createdTx))
              .then((status) => {
                curNode.data.stage = 2;
                curNode.data.status = status;
              });
          }
        });
      } else {
        finishedSet.add(curNode.data.hash);
        removeNode(curNode);
      }
    }
  });
  setTimeout(() => {
    if (curNode.next != null) {
      iterator(curNode.next);
    }
  }, 1000);
}

setInterval(() => {
  if (lastNode == null) {
    return;
  }
  if (trackedSwaps != null) {
    iterator(trackedSwaps);
  }
  //TODO: change to minute
}, 10000);
//==================================================================================
//Get TX status
//==================================================================================
app.post("/txStatus", async function (req, res) {
  console.log("tx status called");
  let hash = req.body.id;
  let data = hashToData[hash];
  if (data === undefined) {
    if (finishedSet.has(hash)) {
      data = { stage: 2, status: "finished" };
    } else {
      data = { stage: 0, status: "nonexistant" };
    }
    res.send({ stage: data.stage, status: data.status });
  } else {
    res.send({ stage: data.stage, status: data.status });
  }
});

//==================================================================================
//Start TX
//==================================================================================
app.post("/startTX", async function (req, res) {
  console.log("Creating BTC to XMR transaction");
  let { amount, hash } = req.body;
  let preTransactionStats = await createTX(
    "https://api.changenow.io/v1/transactions/" + api_key,
    amount,
    moneroAddress,
    "btc",
    "xmr"
  );
  console.log(preTransactionStats);
  //add to setInterval check
  addNode({
    time: +new Date(),
    id: preTransactionStats.id,
    userDestBTC: req.body.address,
    hash,
    status: "waiting",
    stage: 1,
  });
  res.send(preTransactionStats);
});

//==================================================================================
//Daemon queries
//==================================================================================
app.post("/getGasXMR", async function (req, res) {
  let amount = req.body.amount;
  console.log(req.body);
  let atomicAmount = convertFromFloatToBigIntX10_12(amount);
  console.log({ atomicAmount });
  let createdTx = await walletRPC.createTx({
    accountIndex: 0,
    address: "43oTJhyfJ5vageq8o1LPHyDVdM5iVdBEfev985yjhvLA9SunSQgnC4Jaab87ak6k7k53kNfMWit5q9TNuJKSTFVZVG25cFe",
    amount: atomicAmount,
    relay: false,
  });
  let fee = await createdTx.getFee();
  let parsedFee = parseInt(fee) / 10 ** 12;
  res.send({ estimatedGas: parsedFee });
});

async function getMinAmountFromBTCtoXMR() {
  const response = await fetch("https://api.changenow.io/v1/min-amount/btc_xmr?api_key=" + api_key);
  const minAmount = await response.json();
  return minAmount;
}

async function estimateRecieved(amount, pathString) {
  let reqStr = "https://api.changenow.io/v1/exchange-amount/" + amount + "/" + pathString + "?api_key=" + api_key;

  let response = await fetch(reqStr);
  let jsonResponse = await response.json();
  return jsonResponse;
}
async function getTransactionStatus(id) {
  const response = await fetch("https://api.changenow.io/v1/transactions/" + id + "/" + api_key);
  let backupStatus;
  let statusR = await response.json().catch((err) => {
    backupStatus = { status: "nonexistant" };
  });
  if (backupStatus !== undefined) {
    statusR = backupStatus;
  }
  return statusR;
}

//==================================================================================
//Miscellaneous
//==================================================================================
function convertFromFloatToBigIntX10_12(amount) {
  if (amount === 0) {
    return 0;
  }
  let str = "";
  let amountStr = amount.toString();
  let decimalCount = 0;
  let decimalPassed = false;
  console.log(amountStr);
  while (amountStr.length > 0 && amountStr[0] === "0") {
    amountStr = amountStr.slice(1);
  }
  for (let i = 0; i < amountStr.length && decimalCount < 12; i++) {
    if (amountStr[i] === ".") {
      decimalPassed = true;
    } else {
      if (decimalPassed === true) {
        decimalCount++;
      }
      str += amountStr[i];
    }
  }
  str += "0".repeat(12 - decimalCount);
  console.log({ str });
  return BigInt(str);
}
function trim(num, maxDec) {
  let d = false;
  let c = 0;
  let res = "";
  for (let i = 0; i < num.length && c < maxDec; i++) {
    if (num[i] === ".") {
      d = true;
    } else {
      if (d) {
        c++;
      }
    }
    res += num[i];
  }
  return res;
}
//==================================================================================
//Startup
//==================================================================================

const ipToWalletIndices = {};
const highestIndex = [0, 1];
const walletIndexToAddress = {};
const walletIndexToIP = {};
const addressToIndices = {};
const IPtoAddress = {};
//TODO: test new major index
async function createMoneroWallet(ipAddress) {
  if (ipToWalletIndices[ipAddress] === undefined) {
    let nextSubIndex = highestIndex[1] + 1;
    let nextIndex = highestIndex[0];
    if (nextSubIndex === 10) {
      nextSubIndex = 0;
      nextIndex = nextIndex + 1;
    }
    ipToWalletIndices[ipAddress] = [nextIndex, nextSubIndex];
    walletIndexToIP[nextIndex + "," + nextSubIndex] = ipAddress;
    let moneroAddress = await walletRPC.getAddress(nextIndex, nextSubIndex);

    addressToIndices[moneroAddress] = [nextIndex, nextSubIndex];
    walletIndexToAddress[nextIndex + "," + nextSubIndex] = moneroAddress;
    IPtoAddress[ipAddress] = moneroAddress;
    console.log(100, ipToWalletIndices[ipAddress]);
    return moneroAddress;
  } else {
    let subIndex = ipToWalletIndices[ipAddress][1];
    let index = ipToWalletIndices[ipAddress][0];
    let moneroAddress = await walletRPC.getAddress(index, subIndex);
    IPtoAddress[ipAddress] = moneroAddress;
    console.log(106, ipToWalletIndices[ipAddress]);
    return moneroAddress;
  }
}

//==================================================================================
//Transaction methods
//==================================================================================

async function createTX(url, amount, address, from, to) {
  console.log({ from, to, amount, address });
  let data = {
    from,
    to,
    address,
    amount: trim(amount.toString(), 6),
    extraId: "",
    userId: "",
    contactEmail: "",
    refundAddress: "",
    refundExtraId: "",
  };
  /*Example Response:
  {
  "payinAddress": "328E95juhLbXeDDVDR9thh58MtCsnKuvf6",
  "payoutAddress": "0x57f31ad4b64095347F87eDB1675566DAfF5EC886",
  "payoutExtraId": "",
  "fromCurrency": "btc",
  "toCurrency": "eth",
  "refundAddress": "",
  "refundExtraId": "",
  "id": "33d9b8e1867579",
  "amount": 74.7999317
}*/
  console.log(JSON.stringify(data));
  const response = await fetch(url, {
    method: "POST", // *GET, POST, PUT, DELETE, etc.
    mode: "cors", // no-cors, *cors, same-origin
    cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
    credentials: "same-origin", // include, *same-origin, omit
    headers: {
      "Content-Type": "application/json",
      // 'Content-Type': 'application/x-www-form-urlencoded',
    },
    redirect: "follow", // manual, *follow, error
    referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    body: JSON.stringify(data), // body data type must match "Content-Type" header
  });
  let decoded = await response.json(); // parses JSON response into native JavaScript objects
  return decoded;
}

//========================================================================
//Server startup
//========================================================================
async function initialize() {
  walletRPC = await moneroTs.connectToWalletRpc("http://127.0.0.1:6060", "user", "usery");
}
initialize();
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
