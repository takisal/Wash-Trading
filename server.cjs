const moneroTs = require("monero-ts");
const api_key = require("./config.js");
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
app.post("/sendXMR", async function (req, res) {
  //TODO: validate IP with userAddress
  console.log(req.body);
  let transactionStatus = await sendMonero(req.body.address, req.body.userXMRAddress, req.body.amount);
  res.send({ transactionStatus });
});
app.post("/estimate", async function (req, res) {
  let estimated = await estimateRecieved(req.body.amount, req.body.path);
  res.send(estimated);
});
app.post("/transactionStatus", async function (req, res) {
  let statusResult = await getTransactionStatus(req.body.id);
  console.log({ statusResult });
  res.send(statusResult);
});
app.post("/createBTCToXMRTX", async function (req, res) {
  console.log("Creating BTC to XMR transaction");
  let { amount, moneroAddress } = req.body;
  let preTransactionStats = await createTX(
    "https://api.changenow.io/v1/transactions/" + api_key,
    amount,
    moneroAddress,
    "btc",
    "xmr"
  );
  console.log(preTransactionStats);
  res.send(preTransactionStats);
});
let walletRPC;
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
async function queryAddressTotal(address) {
  let amount = BigInt(0);
  let transactions = await walletRPC.getTransfers({ isIncoming: true, address });
  for (let i = 0; i < transactions.length; i++) {
    amount += transactions[i].amount;
  }
  return amount;
}

app.post("/checkrpc", async function (req, res) {
  console.log("Creating XMR to BTC transaction");

  res.send("done");
});
async function initialize() {
  walletRPC = await moneroTs.connectToWalletRpc("127.0.0.1:6060", "user", "usery");
}
initialize();

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
async function sendMonero(to, from, amount) {
  console.log({ to, from, amount });
  let formattedAmount = "";
  let decimalPassed = false;
  let zeroesToAdd = 12;
  let amountStr = amount.toString();
  while (amountStr.length > 0 && amountStr[0] === "0") {
    amountStr = amountStr.slice(1);
  }
  for (let i = 0; i < amountStr.length; i++) {
    if (amountStr[i] === ".") {
      decimalPassed = true;
    } else {
      formattedAmount += amountStr[i];
      if (decimalPassed === true) {
        zeroesToAdd--;
      }
    }
  }
  formattedAmount += "0".repeat(zeroesToAdd);
  console.log({ formattedAmount });
  let walletIndices = addressToIndices[from];
  let createdTx = await walletRPC.createTx({
    accountIndex: walletIndices[0],
    subaddressIndex: walletIndices[1],
    address: to,
    amount: formattedAmount, //(denominated in atomic units)
    relay: false, // create transaction and relay to the network if true
  });
  let status = await walletRPC.relayTx(createdTx); // relay the transaction
  return status;
}
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
app.post("/createXMRToBTCTX", async function (req, res) {
  console.log("Creating XMR to BTC transaction");
  let { amount, bitcoinAddress } = req.body;
  //make sure user is entitled to >= amount
  let moneroAddress = IPtoAddress[req.socket.remoteAddress];
  let entitledAmount = queryAddressTotal(moneroAddress);
  let atomicAmount = convertFromFloatToBigIntX10_12(amount);
  console.log({ moneroAddress, entitledAmount, atomicAmount });
  if (atomicAmount > entitledAmount) {
    res.send({ Status: "Could not send. Not entitled to enough XMR" });
    return;
  }
  let preTransactionStats = await createTX(
    "https://api.changenow.io/v1/transactions/" + api_key,
    amount,
    bitcoinAddress,
    "xmr",
    "btc"
  );
  res.send(preTransactionStats);
});
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
async function getTransactionStatus(id) {
  const response = await fetch("https://api.changenow.io/v1/transactions/" + id + "/" + api_key);
  const statusR = await response.json();
  return statusR;
}
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

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
