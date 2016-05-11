'use strict';

var _ = require('underscore');
var request = require('request');
var async = require('async');
var moment = require('moment');
var query = require('./query.js');
var url = require('url');

var Itunes = function(username, password, options) {
  this.options = {
    baseURL: 'https://itunesconnect.apple.com',
    loginURL: 'https://idmsa.apple.com/appleauth/auth/signin',
    appleWidgetKey: '22d448248055bab0dc197c6271d738c3',
    concurrentRequests: 2,
    errorCallback: function(e) { console.log('Login failure: ' + e); },
    successCallback: function(d) { console.log('Login success.'); }
  };

  _.extend(this.options, options);

  this._cookies = [];
  this._queue = async.queue(
    this.executeRequest.bind(this),
    this.options.concurrentRequests
  );
  this._queue.pause();

  if (typeof this.options['cookies'] !== 'undefined') {
    this._cookies = this.options.cookies;
    this._queue.resume();
  } else {
    this.login(username, password);
  }
};

Itunes.prototype.executeRequest = function(task, callback) {
  var query = task.query;
  var completed = task.completed;

  var requestBody = query.assembleBody();
  var uri = url.parse(query.apiURL + query.endpoint);

  request.post({
    uri: uri,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://analytics.itunes.apple.com',
      'X-Requested-By': 'analytics.itunes.apple.com',
      'Referer': 'https://analytics.itunes.apple.com/',
      'Cookie': this._cookies
    },
    json: requestBody
  }, function(error, response, body) {
    if (!response.hasOwnProperty('statusCode')) {
			error = new Error('iTunes Connect is not responding. The service may be temporarily offline.');
			body = null;
		} else if (response.statusCode == 401) {
			error = new Error('This request requires authentication. Please check your username and password.');
			body = null;
		}

    completed(error, body);
    callback();
  });
}

Itunes.prototype.login = function(username, password) {
  var self = this;
  request.post({
    url: this.options.loginURL,
    headers: {
      'Content-Type': 'application/json',
      'X-Apple-Widget-Key': this.options.appleWidgetKey
    },
    json: {
      'accountName': username,
      'password': password,
      'rememberMe': false
    }
  }, function(error, response, body) {
    var cookies = response ? response.headers['set-cookie'] : null;

		if (error || !(cookies && cookies.length)) {
			error = error || new Error('There was a problem with loading the login page cookies. Check login credentials.');
      self.options.errorCallback(error);
		} else {
			//extract the account info cookie
			var myAccount = /myacinfo=.+?;/.exec(cookies);

			if (myAccount == null || myAccount.length == 0) {
				error = error || new Error('No account cookie :( Apple probably changed the login process');
        self.options.errorCallback(error);
			} else {
				request.get({
					url 	: self.options.baseURL + "/WebObjects/iTunesConnect.woa",
					followRedirect : false,	//We can't follow redirects, otherwise we will "miss" the itCtx cookie
					headers	: {
						'Cookie': myAccount[0]
					},
				}, function(error, response, body) {
					cookies = response ? response.headers['set-cookie'] : null;

					if (error || !(cookies && cookies.length)) {
						error = error || new Error('There was a problem with loading the login page cookies.');
            self.options.errorCallback(error);
					} else {
						//extract the itCtx cookie
						var itCtx = /itctx=.+?;/.exec(cookies);
						if (itCtx == null || itCtx.length == 0) {
							error = error || new Error('No itCtx cookie :( Apple probably changed the login process');
              self.options.errorCallback(error);
						} else {
							self._cookies = myAccount[0] + " " + itCtx[0];
							self.options.successCallback(self._cookies);
							self._queue.resume();
						}
					}
				});

			}
		}
  });
};

Itunes.prototype.request = function(query, callback) {
  this._queue.push({
    query: query,
    completed: callback
  });
};

module.exports.Itunes = Itunes;
module.exports.Query = query.Query;
module.exports.AnalyticsQuery = query.AnalyticsQuery;
module.exports.frequency = query.frequency;
module.exports.measures = query.measures;
module.exports.dimension = query.dimension;
module.exports.reportType = query.reportType;
