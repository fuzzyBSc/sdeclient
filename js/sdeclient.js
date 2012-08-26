/*global jQuery, weblinking*/
(function (root, $, weblinking) {
	'use strict';
	/*globals exports:true,module,define*/
	// Private
	
	var defaults = {
		minimumPollPeriod_ms: 4000,
		autoFetch: true
	};

	var mainDefaults = {
		cache : true,
		global : false
	};

	var deltaDefaults = {
		cache : true,
		global : false
	};

	var overrides = {

	};

	var mainOverrides = {

	};
	
	var deltaOverrides = {
		// Force a particular timeout for now until we can figure out how to
		// integrate with $.ajaxSettings and the like
		timeout : 30000,
		headers : { "Request-Timeout": 30 }
	};

	var sde = {
		/**
		 * Fetch new data immediately
		 * 
		 * @name sde.fetch
		 * @return {!jQuery.Promise} A promise object that can be used to
		 *         monitor fetch progress
		 */
		fetch: function () {
			var result;
			if (this.ajax) {
				if (!this.deferredFetch) {
					// At most one fetch is ever queued
					this.deferredFetch = $.Deferred();
				}
				result = this.deferredFetch.promise(); 
			} else {
				result = this.fetchImpl();
			}
			return result;
		},
		
		start: function() {
			this.stopped = false;
			this.settings.autoFetch = true;
			this.fetch();
		},

		stop: function() {
			this.stopped = true;
		},

		fetchImpl: function () {
			if (this.ajax) throw "fetchImpl called when ajax is ongoing";

			var settings, obj=this, deferredFetch = this.deferredFetch;
			this.deferredFetch = null;
			
			this.lastFetchDate = new Date();
			if (this.deltaSettings.url) {
				// Fetch delta
				this.ajax = $.ajax(this.deltaSettings);
				this.ajax.then(
					function (data) { obj.deltaDone(data); },
					function (data) { obj.deltaFail(data); }
					);
			} else {
				// Fetch main
				this.ajax = $.ajax(this.mainSettings);
				this.ajax.then(
					function (data) { obj.mainDone(data); },
					function (data) { obj.mainFail(data); }
					);
			}
			
			if (deferredFetch) {
				this.ajax.then(
						function (data) { deferredFetch.resolve(data); },
						function (data) { deferredFetch.reject(data); },
						function (data) { deferredFetch.notify(data); }
						)
			}
			
			return this.ajax;
		},
		
		timedFetchImpl: function () {
			// The delayed fetch may occur when a manual fetch is in progress.
			// If so, don't do that fetch.
			if (!this.ajax && !this.deferedFetch) this.fetchImpl();
		},
	
		timedFetch: function () {
			var obj = this;
			if (this.ajax) throw "timedFetch called when ajax is ongoing";
			if (this.deferredFetch) throw "timedFetch called when there is a deferred fetch";

			var date = new Date();
			var timeout = this.settings.minimumPollPeriod_ms - (date.getTime() - this.lastFetchDate.getTime());
			if (timeout > 0) {
				root.setTimeout(function () { obj.timedFetchImpl(); }, timeout);
			} else {
				this.fetchImpl();
			}
		},
	
		startNext: function (immediate) {
			if (!this.ajax && !this.stopped) {
				if (this.deferredFetch) {
					this.fetchImpl();
				} else if (this.settings.autoFetch) {
					if (immediate) {
						this.fetchImpl();
					} else {
						this.timedFetch();
					}
				} // else don't start a new fetch
			}
		},

		mainDone: function (value) {
			var header = this.ajax.getResponseHeader("Link");
			var links = header?weblinking.parseHeader(header):null;
			this.ajax = null;

			if (links) {
				var delta = links.getLinkValuesByRel("delta");
				if (delta.length == 1) {
					this.deltaSettings.url = delta[0].href;
				}
			}
			
			this.mainDoneCallbacks.fire(value);
			this.doneCallbacks.fire(value);
			this.progressCallbacks.fire();

			// If we have a delta URL we can fetch immediately in the autoFetch
			// case. We shouldn't hammer the server if it turns out that delta
			// encoding is either not supported or not being offered at this
			// time.
			this.startNext(this.deltaSettings.url);
		},

		mainFail: function () {
			this.ajax = null;

			this.failedCallbacks.fire();
			this.progressCallbacks.fire();

			// A failure of the main URL is not expected to have a delta link,
			// so we wait before fetching this main resource again.
			this.startNext(false);
		},
		
		deltaDone: function (value) {
			var header = this.ajax.getResponseHeader("Link");
			var links = header?weblinking.parseHeader(header):null;
			var status = this.ajax.status;
			this.ajax = null;

			if (status == 204) {
				// No content

				this.progressCallbacks.fire();

				// The server has given us all it has to give right now. Either
				// it doesn't support long poll or it has already waited around
				// for a while to give us a result. In either case we don't want
				// to poll immediately if we are still within the minimum poll
				// period, so don't force an immediate fetch.
				this.startNext(false);
			} else {
				// A valid delta
				if (links) {
					var delta = links.getLinkValuesByRel("next");
					if (delta.length == 1) {
						this.deltaSettings.url = delta[0].href;
					}
				} else {
					this.deltaSettings.url = null;
				}

				this.deltaDoneCallbacks.fire(value);
				this.doneCallbacks.fire(value);
				this.progressCallbacks.fire();

				// The server has just given us valid data. If the link it
				// supplied was also good then we should be able to
				// query again immediately. This makes the most sense in a long
				// poll scenario, where this new request will be registered with
				// the server and the server will do its best to wait for a
				// change to occur before returning the next update. In the
				// short poll case this means that every time a valid set of
				// deltas is returned we will immediately issue another poll to
				// see whether it is part of a flood of new messages. In most
				// cases the short poll case will return 202 in this case but
				// the overhead shouldn't be too large - especially if a good
				// caching model is in place.
				//
				// If no link was supplied we will be fetching the main again
				// soon. In that case we probably don't want to do so
				// immediately. This is an unusual case where the server
				// provides a delta but no link, so it's hard to optimise for
				// sensibly. Here we look for consistency with a good main fetch
				// that fails to include a delta link.
				this.startNext(this.deltaSettings.url);
			}
		},

		deltaFail: function () {
			this.ajax = null;

			// Any delta failure should see us switching back to the main URL.
			this.deltaSettings.url = null;
			this.progressCallbacks.fire();

			// A failed delta should result in an immediate fetch to the main
			// resource to regain synchronisation.
			this.startNext(true);
		}

	};
	
	var sdeclient = {
		// Public

		/** Create an object to fetch the main and delta resources
		 * 
		 * Bugs:
		 * <ul>
		 * <li>Currently only absolute URIs are supported in link relations</li>
		 * </ul>
		 * 
		 * @param {!String} mainURL The URL for the main resource, used whenever a delta URL is not available
		 * @name sdeclient.create
		 */
		create: function (a, b) {
			var mainURL, settings;
			if (b === undefined) {
				mainURL = undefined;
				settings = a;
			} else {
				mainURL = a;
				settings = b;
			}
			var that = Object.create(sde);
			that.mainSettings = $.extend({}, mainDefaults, settings, settings.main, mainOverrides);
			that.deltaSettings = $.extend({}, deltaDefaults, settings, settings.delta, deltaOverrides);
			//that.deltaSettings.headers = $.extend({}, deltaDefaults.headers, settings.headers, settings.delta.headers, deltaOverrides.headers);
			that.settings = $.extend({}, defaults, settings, overrides);
			if (mainURL !== undefined) {
				that.mainSettings.url = mainURL;
			}
			
			that.mainDoneCallbacks = $.Callbacks();
			that.deltaDoneCallbacks = $.Callbacks();
			that.doneCallbacks = $.Callbacks();
			that.failedCallbacks = $.Callbacks();
			that.progressCallbacks = $.Callbacks();
			
			that.fetch();
			return that;
		},
		
		setup: function (settings) {
			$.extend(defaults, settings);
		}
	};
	
	// Export sdeclient using similar export mechanism as in uris.js/underscore.js.
	// Add 'sdeclient' to the global object if not in a module environment.
	if (typeof define === 'function' && define.amd) {
		// Register as a module with AMD.
		define([], function () {
			return sdeclient;
		});
	} else if (typeof exports !== 'undefined') {
		if (typeof module !== 'undefined' && module.exports) {
			exports = module.exports = sdeclient;
		}
		exports.sdeclient = sdeclient;
	} else {
		// Exported as a string, for Closure Compiler "advanced" mode.
		root['sdeclient'] = sdeclient;
	}
})(this, jQuery, weblinking);
