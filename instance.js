// Auto configure if settings are provided
StatsD._loadClient = function() {
  if (Match.test(Meteor.settings.statsd, Object)) {
    try {
      check(Meteor.settings.statsd, {
        host: String,
        port: Match.OneOf(Number, String),
        prefix: String,
        debug: Match.Optional(Boolean)
      });
    } catch (err) {
      throw new Error('Invalid statsd settings (need host, port, and prefix)');
    }

    StatsD._instance = new StatsD(Meteor.settings.statsd.host,
      Meteor.settings.statsd.port, Meteor.settings.statsd.prefix,
      Meteor.settings.statsd.debug);
  } else {
    console.error('Warning: StatsD is not configured! Metrics will not be tracked');
  }

  var notConfigured = function() {
    return false;
  };

  // Attach the methods of the instance to the main StatsD object for
  // convenience
  ['count', 'gauge', 'timer', 'startTimer'].forEach(function(method) {
    if (StatsD._instance) {
      StatsD[method] = _.bind(StatsD._instance[method], StatsD._instance);
    } else {
      StatsD[method] = notConfigured;
    }

  });
};

StatsD._loadClient();
