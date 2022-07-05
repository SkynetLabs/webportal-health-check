module.exports = (req, res) => {
  res.send(process.env.serverip); // variable set during docker image startup
};
