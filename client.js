var dgram = Npm.require('dgram');
var net = Npm.require('net');

/**
 * Create a new StatsD client
 * @param {string} host   The host IP address or domain name (no protocol)
 * @param {int} port      The port running StatsD on the host (usually 8125).
 *                        give a String like "tcp:8125" to use TCP sockets.
 * @param {string} prefix Optional prefix for all metrics.
 * @param {bool} debug    If true, `track` will happen synchronously so you will see errors. 
 *                        Otherwise it will happen asynchronously with no callback (it uses 
 *                        UDP anyway and we don't want to block)
 */
StatsD = function(host, port, prefix, debug) {
  var match;
  if(typeof(port) == 'string' && (match = port.match(/^(tcp|udp|unix):(.*)$/))) {
    this._proto = match[1];
    port = this._proto == 'unix' ? match[2] : Number(match[2]);
  } else {
    this._proto = 'udp';
  }

  this._host = host;
  this._port = port;
  if (prefix) {
    this._prefix = prefix + '.';
  }
  this._debug = debug;
};

/**
 * Explicitly open the UDP socket connection for reuse.
 */
StatsD.prototype._openSocket = function() {
  var that = this;

  if(this._proto == 'udp') {
    this._client = dgram.createSocket('udp4');
  } else {
    if(this._proto == 'unix') {
      this._client = net.createConnection(this._port);
    } else {
      this._client = net.createConnection(this._port, this._host);
    }

    this._client.send = function(buf, offset, length, port, address, callback) {
      that._client.write(buf.slice(offset, offset+length) + "\n", callback);
    };

    this._client.on('close', function() {
      that._client = null;
    });

    this._client.on('error', function(e) {
      console.log("StatsD socket error: " +e);
    });
  }

  // Add the sync method for sending
  if (this._debug) {
    this._client.sendSync = Meteor.wrapAsync(this._client.send, this._client);
  }
};

/**
 * Track a metric
 * @see  Params for StatsD.prototype._generateMessage
 * @return {int}                  Number of bytes sent, if in debug mode.
 */
StatsD.prototype.track = function(metric, value, options) {
  if (!this._client) {
    this._openSocket();
  }

  var msg = this._generateMessage(metric, value, options);

  // Previously, this was all UDP.  Now TCP is an option, but we
  // retain a default-async behavior because it's still expected
  // to be lossy, and shouldn't block.  Unless it should, because
  // _debug.
  var methodName = this._debug ? 'sendSync' : 'send';
  if (this._debug) {
    console.log('Sending ' + msg.toString());
  }
  return this._client[methodName](msg, 0, msg.length, this._port, this._host);

};

// Alias
StatsD.prototype.count = function(metric, value) {
  return this.track(metric, value);
};

/**
 * Courtesy function for gauge.
 * @see  params for _generateMessage
 */
StatsD.prototype.gauge = function(metric, value) {
  return this.track(metric, value, {
    type: 'gauge'
  });
};

/**
 * Courtesy function for timer
 * @see  params for _generateMessage
 * @param {string} timingInterval The timing interval (defaults to 'ms')
 */
StatsD.prototype.timer = function(metric, value, timingInterval) {
  if (!timingInterval) {
    timingInterval = 'ms';
  }

  return this.track(metric, value, {
    type: 'timer',
    timingInterval: timingInterval
  });
};

/**
 * Generate the message buffer according to passed arguments
 * 
 * @param  {string} metric                  The name of the metric (the prefix passed to 
 *                                          StatsD.constructor will be prepended)
 * @param  {float|int} value                The value of the metric
 * @param  {object} options                 Additional parameters
 * @param {string} options.type             The type of metric. Defaults to "count", but 
 *                                          "gauge", and "timer" are also suppored
 * @param {string} options.timingInterval   If options.type is "time", you can change the 
 *                                          timing interval to something other than "ms"
 * @param {float} options.samplePercentage  Only send data this percent of the time (1.0 is 100%)
 * @return {Buffer}                         The message, as a buffer
 */
StatsD.prototype._generateMessage = function(metric, value, options) {
  if (!options) {
    options = {};
  }
  options = _.defaults(options, {
    type: 'count',
    timingInterval: 'ms',
    samplePercentage: 1.0
  });

  if (this._prefix) {
    metric = this._prefix + metric;
  }

  var packet = metric + ':' + value;
  switch (options.type) {
    case 'gauge':
      packet += '|g';
      break;
    case 'timer':
      packet += '|' + options.timingInterval;
      break;
    default: // Count
      packet += '|c';
      break;
  }

  if (options.samplePercentage !== 1) {
    packet += '|@' + options.samplePercentage.toString();
  }

  // Create the message
  return Buffer.from(packet);
};

/**
 * Explicitly close the connection when finished.
 */
StatsD.prototype.closeSocket = function() {
  if (this._client) {
    if(this._proto == 'udp') {
      this._client.close();
    } else {
      this._client.end();
    }
    this._client = null;
  }
};

/**
 * Start a timer that will automatically record its elapsed time to statsd
 * when you run the `stop()` method on the returned Timer.
 * 
 * @param  {String} metricName The name of the metric
 * @return {Timer}
 */
StatsD.prototype.startTimer = function(metricName) {
  var timer = new Timer(metricName, this);
  timer.start();
  return timer;
};
