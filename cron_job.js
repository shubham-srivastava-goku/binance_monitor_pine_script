const axios = require('axios');

(async () => {
  const response = await axios.get('https://binance-monitor-pine-script.onrender.com/test'); 
  console.log('response = ', response.data);
})();