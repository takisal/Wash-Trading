function decode(encoded) {
  let str = (encoded / BigInt(781)).toString().slice(1);
  let res = "";
  let holder = [];
  while (str.length > 0) {
    holder.push(str.slice(0, 4));
    str = str.slice(4);
  }
  for (let i = 0; i < holder.length; i++) {
    res += String.fromCharCode(parseInt(holder[i]));
  }
  return res;
}
function encode(raw) {
  let intermediate = "1";
  for (let i = 0; i < raw.length; i++) {
    let block = raw[i].charCodeAt(0).toString();
    while (block.length < 4) {
      block = "0" + block;
    }
    intermediate += block;
  }

  let numericalRepresentation = BigInt(intermediate);
  return numericalRepresentation * BigInt(781);
}
let funcs = { encode, decode };
export default funcs;
