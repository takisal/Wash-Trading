import "./App.css";
import { useState, useEffect, useCallback } from "react";
import encoding from "./customEncodingScheme.js";
import words from "./words";

/*
API - Get the minimum exchange amount for the selected currency pair with the

'Minimal Exchange Amount'

method;

UI - Ask a user for the amount to exchange and check if this amount is bigger than the minimum exchange amount;

API - Call the

'Estimated Exchange Amount'

method to get the estimated amount for the exchange (in our example, ETH estimated amount);

UI - Show a user the estimated exchange amount and ask for confirmation;

UI - Ask a user for their wallet address to send the funds after the exchange is completed (their refund address, extra ID, refund extra ID);

API - Call the

'Create Exchange Transaction'

method to create an exchange and get the deposit address (in our example, the generated BTC wallet address is returned from this method);

UI - Ask a user to send the funds that they want to exchange to the generated deposit address (in our example, user has to send BTC coins);

UI - A user sends coins, ChangeNOW performs an exchange and makes a withdrawal to user address (in our example, to their ETH address);

API - With

'Transaction status'

you can get the transaction status and display it to a user for them to obtain all the info on the exchange.

*/

function App() {
  const [minAmount, setMinAmount] = useState("0");
  const [lowTime, setLowTime] = useState(0);
  const [highTime, setHighTime] = useState(0);
  const [amountOfXMRToReceive, setAmountOfXMRToReceive] = useState(0);
  const [amountOfBTCToReceive, setAmountOfBTCToReceive] = useState(0);
  const [amountOfBTCToSend, setAmountOfBTCToSend] = useState(0);
  const [destinationBTCAddress, setDestinationBTCAddress] = useState("");
  const [userXMRAddress, setUserXMRAddress] = useState("");
  const [encodedMoneroWallet, setEncodedMoneroWallet] = useState("");
  const [finalBTCAddress, setFinalBTCAddress] = useState("");
  const [step1ID, setStep1ID] = useState("");
  const [step2ID, setStep2ID] = useState("");
  const [step1Status, setStep1Status] = useState("");
  const [step2Status, setStep2Status] = useState("");
  const [destinationXMRAddress, setDestinationXMRAddress] = useState("");
  const [moneroTXCreated, setMoneroTXCreated] = useState(false);
  const [interval, setScopedInterval] = useState(null);
  const [gasXMR, setGasXMR] = useState(0);
  const [hardcodedGas, setHardcodedGas] = useState(0);
  function convertFromEncodedToRaw(data) {
    return encoding.decode(data).toString();
  }
  function convertFromRawToEncoded(address) {
    let encoded = encoding.encode(address);
    setEncodedMoneroWallet(encoded.toString());
    return encoded;
  }

  const createXMRWallet = useCallback(async () => {
    setEncodedMoneroWallet("waiting");
    console.log("initializing monero ");
    var requestOptions = {
      method: "GET",
      redirect: "follow",
    };

    fetch("http://localhost:3000/createMoneroWallet", requestOptions)
      .then((response) => response.json())
      .then((result) => {
        setUserXMRAddress(result.address.toString());
        convertFromRawToEncoded(result.address.toString());
        console.log(result);
      })
      .catch((error) => console.log("error", error));
  }, []);

  function getMinAmount() {
    var requestOptions = {
      method: "GET",
      redirect: "follow",
    };

    fetch("http://localhost:3000/getMinAmount", requestOptions)
      .then((response) => response.json())
      .then((result) => {
        setMinAmount((result.minAmount * 2).toString());
        console.log(result);
      })
      .catch((error) => console.log("error", error));
  }
  function estimateReceived(amount) {
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    let raw = JSON.stringify({ amount, path: "btc_xmr" });
    console.log(raw);
    var requestOptions = {
      method: "POST",
      headers: myHeaders,
      redirect: "follow",
      body: raw,
    };
    console.log(requestOptions);
    fetch("http://localhost:3000/estimate", requestOptions)
      .then((response) => response.json())
      .then((result) => {
        let lowEndTime = "";
        let highEndTime = "";
        let preDash = true;
        for (let i = 0; i < result.transactionSpeedForecast.length; i++) {
          if (result.transactionSpeedForecast[i] === "-") {
            preDash = false;
          } else {
            if (preDash) {
              lowEndTime += result.transactionSpeedForecast[i];
            } else {
              highEndTime += result.transactionSpeedForecast[i];
            }
          }
        }
        lowEndTime = parseInt(lowEndTime);
        highEndTime = parseInt(highEndTime);
        setLowTime(lowEndTime);
        setHighTime(highEndTime);
        setAmountOfXMRToReceive(result.estimatedAmount);
        estimateReceivedStep2(result.estimatedAmount - hardcodedGas);
        console.log(
          "Time Low Estimate: ",
          lowEndTime,
          "Time High Estimate: ",
          highEndTime,
          "EstimatedAmount: ",
          result.estimatedAmount
        );
      })
      .catch((error) => console.log("error", error));
  }
  function estimateReceivedStep2(amount) {
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    let raw = JSON.stringify({ amount, path: "xmr_btc" });
    console.log(raw);
    var requestOptions = {
      method: "POST",
      headers: myHeaders,
      redirect: "follow",
      body: raw,
    };
    console.log(requestOptions);
    fetch("http://localhost:3000/estimate", requestOptions)
      .then((response) => response.json())
      .then((result) => {
        let lowEndTime2 = "";
        let highEndTime2 = "";
        let preDash = true;
        for (let i = 0; i < result.transactionSpeedForecast.length; i++) {
          if (result.transactionSpeedForecast[i] === "-") {
            preDash = false;
          } else {
            if (preDash) {
              lowEndTime2 += result.transactionSpeedForecast[i];
            } else {
              highEndTime2 += result.transactionSpeedForecast[i];
            }
          }
        }
        setLowTime(lowTime + parseInt(lowEndTime2));
        setHighTime(highTime + parseInt(highEndTime2));
        setAmountOfBTCToReceive(result.estimatedAmount);
      })
      .catch((error) => console.log("error", error));
  }
  function handleInput1Change(e) {
    setAmountOfBTCToSend(e.target.value);
  }
  function handleInput2Change(e) {
    setFinalBTCAddress(e.target.value);
  }
  function generateSeed() {
    let seed = "";
    let chosenWords = new Set();
    for (let i = 0; i < 14; i++) {
      let chosenNumber = Math.floor(Math.random() * words.length);
      if (!chosenWords.has(chosenNumber)) {
        chosenWords.add(chosenNumber);
        seed += words[chosenNumber];
      }
    }
    return seed;
  }

  function createBTCtoXMRTransaction(amount) {
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    let raw = JSON.stringify({ amount, moneroAddress: userXMRAddress });
    var requestOptions = {
      method: "POST",
      headers: myHeaders,
      redirect: "follow",
      body: raw,
    };
    fetch("http://localhost:3000/createBTCToXMRTX", requestOptions)
      .then((response) => response.json())
      .then((result) => {
        console.log("got response: ", result);
        if (result.payinAddress === undefined) {
          setDestinationBTCAddress("Error beggining process. Error communicating with ChangeNow API");
        } else {
          if (result.expectedReceiveAmount !== undefined) {
            setAmountOfXMRToReceive(result.expectedReceiveAmount);
          }
          setDestinationBTCAddress(result.payinAddress);
          setStep1ID(result.id);
        }
      })
      .catch((error) => console.log("error", error));
  }
  //createXMRToBTCTransaction
  const createXMRToBTCTransaction = useCallback(
    (amount, bitcoinAddress) => {
      var myHeaders = new Headers();
      myHeaders.append("Content-Type", "application/json");
      let raw = JSON.stringify({ amount, bitcoinAddress });
      var requestOptions = {
        method: "POST",
        headers: myHeaders,
        redirect: "follow",
        body: raw,
      };
      fetch("http://localhost:3000/createXMRToBTCTX", requestOptions)
        .then((response) => response.json())
        .then((result) => {
          console.log("got response: ", result);
          if (result.payinAddress === undefined) {
            setDestinationXMRAddress("Error beggining process. Error communicating with ChangeNow API");
          } else {
            //send XMR
            setDestinationXMRAddress(result.payinAddress);
            setStep2ID(result.id);
            sendXMRToAddress(result.payinAddress, userXMRAddress, amount);
          }
        })
        .catch((error) => console.log("error", error));
    },
    [userXMRAddress]
  );
  function createXMRToBTCTransactionTest(amount, bitcoinAddress) {
    setStep1Status("finished");
    setMoneroTXCreated(true);
    createXMRToBTCTransaction(amount - hardcodedGas, bitcoinAddress);
  }
  const viewTXStatus = useCallback(
    (id, stepNumber) => {
      console.log("viewTXStatus");
      var myHeaders = new Headers();
      myHeaders.append("Content-Type", "application/json");
      let raw = JSON.stringify({ id });
      var requestOptions = {
        method: "POST",
        headers: myHeaders,
        redirect: "follow",
        body: raw,
      };
      fetch("http://localhost:3000/transactionStatus", requestOptions)
        .then((response) => response.json())
        .then((result) => {
          console.log("got response: ", result);
          if (result.status === undefined) {
            console.log("Could not got TX status");
          } else {
            if (stepNumber === 1) {
              setStep1Status(result.status);
              if (result.status === "finished" && moneroTXCreated === false) {
                setMoneroTXCreated(true);
                createXMRToBTCTransaction(result.amountReceive - hardcodedGas, finalBTCAddress);
              }
            } else if (stepNumber === 2) {
              setStep2Status(result.status);
            }
          }
        })
        .catch((error) => console.log("error", error));
    },
    [finalBTCAddress, hardcodedGas, moneroTXCreated, createXMRToBTCTransaction]
  );
  async function getGasXMR() {
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    let raw = JSON.stringify({ amount: 0.2 });
    var requestOptions = {
      method: "POST",
      headers: myHeaders,
      redirect: "follow",
      body: raw,
    };

    fetch("http://localhost:3000/getGasXMR", requestOptions)
      .then((response) => response.json())
      .then((result) => {
        console.log(result);
        setGasXMR(result.estimatedGas);
      })
      .catch((error) => console.log("error", error));
  }
  useEffect(() => {
    setHardcodedGas(0.02);
    if (encodedMoneroWallet === "") {
      createXMRWallet();
    }
  }, [encodedMoneroWallet, createXMRWallet]);
  useEffect(() => {
    //wait on XMR wallet to recieve
    //wait on BTC wallet to receive
    let newInterval = setInterval(() => {
      console.log("interval started", { step1ID, step1Status });
      //getGasXMR();
      if (step1ID !== "" && step1ID !== undefined && step1Status !== "finished") {
        viewTXStatus(step1ID, 1);
      }
      if (step2ID !== "" && step2ID !== undefined && step2Status !== "finished") {
        viewTXStatus(step2ID, 2);
      }
      console.log("interval ran");
    }, 10000);
    return () => clearInterval(newInterval);
  }, [interval, step1ID, step1Status, step2ID, step2Status, viewTXStatus]);
  function sendXMRToAddress(address, userXMRAddress, amount) {
    //send XMR
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    let raw = JSON.stringify({ address, userXMRAddress, amount });
    console.log(raw, "raw");
    var requestOptions = {
      method: "POST",
      headers: myHeaders,
      redirect: "follow",
      body: raw,
    };
    fetch("http://localhost:3000/sendXMR", requestOptions)
      .then((response) => response.json())
      .then((result) => {
        console.log("sendXMR result: ", result);
      })
      .catch((error) => console.log("error", error));
  }

  return (
    <div className="App">
      <button onClick={getMinAmount}>Get Minimum Amount</button>
      <p>Minimum Amount needed to send: {minAmount}</p>
      <input value={amountOfBTCToSend} onChange={handleInput1Change}></input>
      <label for="btc_final">Address to send the untraceable BTC: </label>
      <input id="btc_final" value={finalBTCAddress} onChange={handleInput2Change}></input>
      <button onClick={estimateReceived.bind(this, amountOfBTCToSend)}>Estimate Received Amount</button>
      <p>
        Swap will take between: {lowTime * 2} to {highTime * 2} minutes
      </p>
      <p>You should receive: {amountOfBTCToReceive} untraceable BTC</p>

      <button onClick={createBTCtoXMRTransaction.bind(this, amountOfBTCToSend)}>Begin wash</button>
      <button onClick={getGasXMR}>Estimate Monero fee</button>
      <button onClick={createXMRToBTCTransactionTest.bind(this, amountOfBTCToSend, finalBTCAddress)}>
        Dev button step 2
      </button>
      <p>
        Before you begin, it is highly recommended you save this data securely incase there is an interuption and you
        need to resume the wash process at step 2: {encodedMoneroWallet}
      </p>
      <p>Send the BTC you would like to wash here: {destinationBTCAddress} </p>
      <h1>Status:</h1>
      <h3>
        {step2Status === "complete" && step1Status === "complete"
          ? "Complete!"
          : step1Status === "complete"
          ? "Step 1: Complete \n Step 2: " + step2Status
          : "Step 1: " + step1Status}
      </h3>
    </div>
  );
}

export default App;
