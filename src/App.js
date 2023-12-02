import logo from "./logo.svg";
import "./App.css";

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

function getMinAmount() {
  var requestOptions = {
    method: "GET",
    redirect: "follow",
  };

  fetch("http://localhost:3000/getMinAmount", requestOptions)
    .then((response) => response.text())
    .then((result) => {
      console.log(result);
    })
    .catch((error) => console.log("error", error));
}
function estimateReceived(amount) {
  var myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");
  let raw = JSON.stringify({ amount });
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
      let highendTime = "";
      let preDash = true;
      for (let i = 0; i < result.transactionSpeedForecast.length; i++) {
        if (result.transactionSpeedForecast[i] === "-") {
          preDash = false;
        } else {
          if (preDash) {
            lowEndTime += result.transactionSpeedForecast[i];
          } else {
            highendTime += result.transactionSpeedForecast[i];
          }
        }
      }
      lowEndTime = parseInt(lowEndTime);
      highendTime = parseInt(highendTime);
      console.log(
        "Time Low Estimate: ",
        lowEndTime,
        "Time High Estimate: ",
        highendTime,
        "EstimatedAmount: ",
        result.estimatedAmount
      );
    })
    .catch((error) => console.log("error", error));
}
function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <button onClick={getMinAmount}>Get Minimum Amount</button>
        <button onClick={estimateReceived.bind(this, 13)}>Estimate Received Amount</button>
        <a className="App-link" href="https://reactjs.org" target="_blank" rel="noopener noreferrer">
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
