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
      let address = "Rate limited";
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
  let transactionStatus = await sendMonero(req.body.address, req.body.userXMRAddress);
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
app.post("/createXMRToBTCTX", async function (req, res) {
  console.log("Creating XMR to BTC transaction");
  let { amount, bitcoinAddress } = req.body;
  let preTransactionStats = await createTX(
    "https://api.changenow.io/v1/transactions/" + api_key,
    amount,
    bitcoinAddress,
    "xmr",
    "btc"
  );
  res.send(preTransactionStats);
});
let walletRPC;
async function initialize() {
  walletRPC = await moneroTs.connectToWalletRpc("127.0.0.1:6060", "user", "usery");
}
initialize();

const ipToWalletIndices = {};
const highestIndex = [0, 1];
const walletIndexToAddress = {};
const walletIndexToIP = {};
const addressToIndices = {};
async function createMoneroWallet(ipAddress) {
  if (ipToWalletIndices[ipAddress] === undefined) {
    let nextSubIndex = highestIndex[1] + 1;
    let nextIndex = highestIndex[0];
    if (nextSubIndex === 10) {
      nextSubIndex = 0;
      nextIndex = 0;
    }
    ipToWalletIndices[ipAddress] = [nextIndex, nextSubIndex];
    walletIndexToIP[nextIndex + "," + nextSubIndex] = ipAddress;
    let moneroAddress = await walletRPC.getAddress(nextIndex, nextSubIndex);

    addressToIndices[moneroAddress] = [nextIndex, nextSubIndex];
    walletIndexToAddress[nextIndex + "," + nextSubIndex] = moneroAddress;
    console.log(100, ipToWalletIndices[ipAddress]);
    return moneroAddress;
  } else {
    let subIndex = ipToWalletIndices[ipAddress][1];
    let index = ipToWalletIndices[ipAddress][0];
    let moneroAddress = await walletRPC.getAddress(index, subIndex);
    console.log(106, ipToWalletIndices[ipAddress]);
    return moneroAddress;
  }
}
async function sendMonero(to, from, amount) {
  let formattedAmount = "";
  let decimalPassed = false;
  let zeroesToAdd = 12;
  for (let i = 0; i < amount.length; i++) {
    if (amount[i] === ".") {
      decimalPassed = true;
    } else {
      formattedAmount += amount[i];
      if (decimalPassed === true) {
        zeroesToAdd--;
      }
    }
  }
  formattedAmount += "0".repeat(zeroesToAdd);
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
