/* >>>>>>>>>> BEGIN source/system/response.js */
// ==========================================================================
// Project:   SproutCore - JavaScript Application Framework
// Copyright: ©2006-2011 Strobe Inc. and contributors.
//            Portions ©2008-2011 Apple Inc. All rights reserved.
// License:   Licensed under MIT license (see license.js)
// ==========================================================================
/*global ActiveXObject */

/**
  A response represents a single response from a server request.  An instance
  of this class is returned whenever you call SC.Request.send().
  
  TODO: Add more info
  
  @extend SC.Object
  @since SproutCore 1.0
*/
SC.Response = SC.Object.extend(
/** @scope SC.Response.prototype */ {
  
  /**
    Becomes true if there was a failure.  Makes this into an error object.
    
    @property {Boolean}
  */
  isError: NO,
  
  /**
    Always the current response
    
    @property {SC.Response}
  */
  errorValue: function() {
    return this;
  }.property().cacheable(),
  
  /**
    The error object generated when this becomes an error
    
    @property {SC.Error}
  */
  errorObject: null,
  
  /** 
    Request used to generate this response.  This is a copy of the original
    request object as you may have modified the original request object since
    then.
   
    To retrieve the original request object use originalRequest.
    
    @property {SC.Request}
  */
  request: null,
  
  /**
    The request object that originated this request series.  Mostly this is
    useful if you are looking for a reference to the original request.  To
    inspect actual properties you should use request instead.
    
    @property {SC.Request}
  */
  originalRequest: function() {
    var ret = this.get('request');
    while (ret.get('source')) ret = ret.get('source');
    return ret ;
  }.property('request').cacheable(),

  /** 
    Type of request.  Must be an HTTP method.  Based on the request
  
    @property {String}
  */
  type: function() {
    return this.getPath('request.type');
  }.property('request').cacheable(),
  
  /**
    URL of request. 
    
    @property {String}
  */
  address: function() {
    return this.getPath('request.address');
  }.property('request').cacheable(),
  
  /**
    If set then will attempt to automatically parse response as JSON 
    regardless of headers.
    
    @property {Boolean}
  */
  isJSON: function() {
    return this.getPath('request.isJSON') || NO;
  }.property('request').cacheable(),

  /**
    If set, then will attempt to automatically parse response as XML
    regarldess of headers.
    
    @property {Boolean}
  */
  isXML: function() {
    return this.getPath('request.isXML') || NO ;
  }.property('request').cacheable(),
  
  /** 
    Returns the hash of listeners set on the request.
    
    @property {Hash}
  */
  listeners: function() {
    return this.getPath('request.listeners');
  }.property('request').cacheable(),
  
  /**
    The response status code.
    
    @property {Number}
  */
  status: -100, // READY

  /**
    Headers from the response.  Computed on-demand
    
    @property {Hash}
  */
  headers: null,
  
  /**
    Response body. If isJSON was set, will be parsed automatically.
    
    @response {Hash|String|SC.Error} the response body or the parsed JSON.
      Returns a SC.Error instance if there is a JSON parsing error.
  */
  body: function() {
    // TODO: support XML
    var ret = this.get('encodedBody');
    if (ret && this.get('isJSON')) {
      try {
        ret = SC.json.decode(ret);
      } catch(e) {
        return SC.Error.create({
          message: e.name + ': ' + e.message,
          label: 'Response',
          errorValue: this });
      }
    }
    return ret;
  }.property('encodedBody').cacheable(),
  
  /** 
    @private
    @deprecated
  
    Alias for body.  Provides compatibility with older code.
    
    @property {Hash|String}
  */
  response: function() {
    return this.get('body');
  }.property('body').cacheable(),
  
  /**
    Set to YES if response is cancelled
  */
  isCancelled: NO,
  
  /**
    Set to YES if the request timed out.  Set to NO if the request has
    completed before the timeout value.  Set to null if the timeout timer is
    still ticking.
  */
  timedOut: null,
  
  /**
    The timer tracking the timeout
  */
  timeoutTimer: null,
  
  // ..........................................................
  // METHODS
  // 

  /**
    Called by the request manager when its time to actually run.  This will
    invoke any callbacks on the source request then invoke transport() to 
    begin the actual request.
  */
  fire: function() {
    var req = this.get('request'),
        source = req ? req.get('source') : null;
    
    
    // first give the source a chance to fixup the request and response
    // then freeze req so no more changes can happen.
    if (source && source.willSend) source.willSend(req, this);
    req.freeze();

    // if the source did not cancel the request, then invoke the transport
    // to actually trigger the request.  This might receive a response 
    // immediately if it is synchronous.
    if (!this.get('isCancelled')) this.invokeTransport();


    // If the request specified a timeout value, then set a timer for it now.
    var timeout = req.get('timeout');
    if (timeout) {
      var timer = SC.Timer.schedule({
        target:   this, 
        action:   'timeoutReached', 
        interval: timeout,
        repeats:  NO
      });
      this.set('timeoutTimer', timer);
    }


    // if the transport did not cancel the request for some reason, let the
    // source know that the request was sent
    if (!this.get('isCancelled') && source && source.didSend) {
      source.didSend(req, this);
    }
  },

  invokeTransport: function() {
    this.receive(function(proceed) { this.set('status', 200); }, this);
  },
  
  /**
    Invoked by the transport when it receives a response.  The passed-in
    callback will be invoked to actually process the response.  If cancelled
    we will pass NO.  You should clean up instead.
    
    Invokes callbacks on the source request also.
    
    @param {Function} callback the function to receive
    @param {Object} context context to execute the callback in
    @returns {SC.Response} receiver
  */
  receive: function(callback, context) {
    if (!this.get('timedOut')) {
      // If we had a timeout timer scheduled, invalidate it now.
      var timer = this.get('timeoutTimer');
      if (timer) timer.invalidate();
      this.set('timedOut', NO);
    }

    var req = this.get('request');
    var source = req ? req.get('source') : null;

    SC.run(function() {
      // invoke the source, giving a chance to fixup the response or (more
      // likely) cancel the request.
      if (source && source.willReceive) source.willReceive(req, this);

      // invoke the callback.  note if the response was cancelled or not
      callback.call(context, !this.get('isCancelled'));

      // if we weren't cancelled, then give the source first crack at handling
      // the response.  if the source doesn't want listeners to be notified,
      // it will cancel the response.
      if (!this.get('isCancelled') && source && source.didReceive) {
        source.didReceive(req, this);
      }

      // notify listeners if we weren't cancelled.
      if (!this.get('isCancelled')) this.notify();
    }, this);

    // no matter what, remove from inflight queue
    SC.Request.manager.transportDidClose(this) ;
    return this;
  },
  
  /**
    Default method just closes the connection.  It will also mark the request
    as cancelled, which will not call any listeners.
  */
  cancel: function() {
    if (!this.get('isCancelled')) {
      this.set('isCancelled', YES) ;
      this.cancelTransport() ;
      SC.Request.manager.transportDidClose(this) ;
    }
  },
  
  /**
    Default method just closes the connection.
  */
  timeoutReached: function() {
    // If we already received a response yet the timer still fired for some
    // reason, do nothing.
    if (this.get('timedOut') === null) {
      this.set('timedOut', YES);
      this.cancelTransport();

      // Invokes any relevant callbacks and notifies registered listeners, if
      // any. In the event of a timeout, we set the status to 0 since we
      // didn't actually get a response from the server.
      this.receive(function(proceed) {
        if (!proceed) return;

        // Set our value to an error.
        var error = SC.$error("HTTP Request timed out", "Request", 0) ;
        error.set("errorValue", this) ;
        this.set('isError', YES);
        this.set('errorObject', error);
        this.set('status', 0);
      }, this);

      return YES;
    }

    return NO;
  },
  
  /**
    Override with concrete implementation to actually cancel the transport.
  */
  cancelTransport: function() {},
  
  /** @private
    Will notify each listener.
  */
  _notifyListener: function(listeners, status) {
    var info = listeners[status], params, target, action;
    if (!info) return NO ;
    
    params = (info.params || []).copy();
    params.unshift(this);
    
    target = info.target;
    action = info.action;
    if (SC.typeOf(action) === SC.T_STRING) action = target[action];
    
    return action.apply(target, params);
  },
  
  /**
    Notifies any saved target/action.  Call whenever you cancel, or end.
    
    @returns {SC.Response} receiver
  */
  notify: function() {
    var listeners = this.get('listeners'), 
        status    = this.get('status'),
        baseStat  = Math.floor(status / 100) * 100,
        handled   = NO ;
        
    if (!listeners) return this ; // nothing to do
    
    handled = this._notifyListener(listeners, status);
    if (!handled) handled = this._notifyListener(listeners, baseStat);
    if (!handled) handled = this._notifyListener(listeners, 0);
    
    return this ;
  },
  
  /**
    String representation of the response object
  */
  toString: function() {
    var ret = arguments.callee.base.apply(this,arguments);
    return "%@<%@ %@, status=%@".fmt(ret, this.get('type'), this.get('address'), this.get('status'));
  }
  
});

/**
  Concrete implementation of SC.Response that implements support for using 
  XHR requests.
  
  @extends SC.Response
  @since SproutCore 1.0
*/
SC.XHRResponse = SC.Response.extend({

  /**
    Implement transport-specific support for fetching all headers
  */
  headers: function() {
    var xhr = this.get('rawRequest'),
        str = xhr ? xhr.getAllResponseHeaders() : null,
        ret = {};
        
    if (!str) return ret;
    
    str.split("\n").forEach(function(header) {
      var idx = header.indexOf(':'),
          key, value;
      if (idx>=0) {
        key = header.slice(0,idx);
        value = header.slice(idx+1).trim();
        ret[key] = value ;
      }
    }, this);
    
    return ret ;
  }.property('status').cacheable(),
  
  // returns a header value if found...
  header: function(key) {
    var xhr = this.get('rawRequest');
    return xhr ? xhr.getResponseHeader(key) : null;    
  },
  
  /**
    Implement transport-specific support for fetching tasks
  */
  encodedBody: function() {
    var xhr = this.get('rawRequest'), ret ;
    if (!xhr) ret = null;
    else if (this.get('isXML')) ret = xhr.responseXML;
    else ret = xhr.responseText;
    return ret ;
  }.property('status').cacheable(),
  

  cancelTransport: function() {
    var rawRequest = this.get('rawRequest');
    if (rawRequest) rawRequest.abort();
    this.set('rawRequest', null);
  },

  invokeTransport: function() {
    var rawRequest, transport, handleReadyStateChange, async, headers;
    
    rawRequest = this.createRequest();

    // save it 
    this.set('rawRequest', rawRequest);
    
    // configure async callback - differs per browser...
    async = !!this.getPath('request.isAsynchronous') ;
    if (async) {
      if (!SC.browser.msie && !SC.browser.opera ) {
        SC.Event.add(rawRequest, 'readystatechange', this, 
                     this.finishRequest, rawRequest) ;
      } else {
        transport=this;
        handleReadyStateChange = function() {
          if (!transport) return null ;
          var ret = transport.finishRequest();
          if (ret) transport = null ; // cleanup memory
          return ret ;
        };
        rawRequest.onreadystatechange = handleReadyStateChange;
      }
    }
    
    // initiate request.  
    rawRequest.open(this.get('type'), this.get('address'), async ) ;
    
    // headers need to be set *after* the open call.
    headers = this.getPath('request.headers') ;
    for (var headerKey in headers) {
      rawRequest.setRequestHeader(headerKey, headers[headerKey]) ;
    }

    // now send the actual request body - for sync requests browser will
    // block here
    rawRequest.send(this.getPath('request.encodedBody')) ;
    if (!async) this.finishRequest() ; // not async
    
    return rawRequest ;
  },
  
  /**
    Creates the correct XMLHttpRequest object for this browser.

    You can override this if you need to, for example, create an XHR on a
    different domain name from an iframe.

    @returns {XMLHttpRequest|ActiveXObject}
  */
  createRequest: function() {
    // Get an XHR object
    function tryThese() {
      for (var i=0; i < arguments.length; i++) {
        try {
          var item = arguments[i]() ;
          return item ;
        } catch (e) {}
      }
      return NO;
    }

    return tryThese(
      function() { return new XMLHttpRequest(); },
      function() { return new ActiveXObject('Msxml2.XMLHTTP'); },
      function() { return new ActiveXObject('Microsoft.XMLHTTP'); }
    );
  },

  /**  @private
  
    Called by the XHR when it responds with some final results.
    
    @param {XMLHttpRequest} rawRequest the actual request
    @returns {SC.XHRRequestTransport} receiver
  */
  finishRequest: function(evt) {
    var rawRequest = this.get('rawRequest'),
        readyState = rawRequest.readyState,
        error, status, msg;

    if (readyState === 4 && !this.get('timedOut')) {
      this.receive(function(proceed) {
        if (!proceed) return ; // skip receiving...
      
        // collect the status and decide if we're in an error state or not
        status = -1 ;
        try {
          status = rawRequest.status || 0;
        } catch (e) {}

        // if there was an error - setup error and save it
        if ((status < 200) || (status >= 300)) {
          
          try {
            msg = rawRequest.statusText || '';
          } catch(e2) {
            msg = '';
          }
          
          error = SC.$error(msg || "HTTP Request failed", "Request", status) ;
          error.set("errorValue", this) ;
          this.set('isError', YES);
          this.set('errorObject', error);
        }

        // set the status - this will trigger changes on relatedp properties
        this.set('status', status);
      
      }, this);

      // Avoid memory leaks
      if (!SC.browser.msie && !SC.browser.opera) {
        SC.Event.remove(rawRequest, 'readystatechange', this, this.finishRequest);	  
      } else {
        rawRequest.onreadystatechange = null;
      }

      return YES;
    }
    return NO; 
  }

  
});

/* >>>>>>>>>> BEGIN source/system/request.js */
// ==========================================================================
// Project:   SproutCore - JavaScript Application Framework
// Copyright: ©2006-2011 Strobe Inc. and contributors.
//            Portions ©2008-2011 Apple Inc. All rights reserved.
// License:   Licensed under MIT license (see license.js)
// ==========================================================================

sc_require('system/response');

/**
  @class
  
  Implements support for Ajax requests using XHR and other prototcols.
  
  SC.Request is much like an inverted version of the request/response objects
  you receive when implementing HTTP servers.  
  
  To send a request, you just need to create your request object, configure
  your options, and call send() to initiate the request.
  
  @extends SC.Object
  @extends SC.Copyable
  @extends SC.Freezable
  @since SproutCore 1.0
*/

SC.Request = SC.Object.extend(SC.Copyable, SC.Freezable,
  /** @scope SC.Request.prototype */ {
  
  // ..........................................................
  // PROPERTIES
  // 
  
/**
  Sends the request asynchronously instead of blocking the browser.  You
  should almost always make requests asynchronous.  You can change this 
  options with the async() helper option (or simply set it directly).

	@default YES
  @property {Boolean}
*/
isAsynchronous: YES,

  /**
    Processes the request and response as JSON if possible.  You can change
    this option with the json() helper method.

    @default NO 
    @property {Boolean}
  */
  isJSON: NO,

  /**
    Process the request and response as XML if possible.  You can change this
    option with the xml() helper method.
    
    @default NO
    @property {Boolean}
  */
  isXML: NO,
  
  
  init: function() {
    arguments.callee.base.apply(this,arguments);
    this.header('X-Requested-With', 'XMLHttpRequest');
    //TODO: we need to have the SC version in a SC variable.
    //For now I'm harcoding the variable.
    this.header('X-SproutCore-Version', SC.VERSION);
  },
  
  /**
    Current set of headers for the request
  */
  headers: function() {
    var ret = this._headers ;
    if (!ret) ret = this._headers = {} ;
    return ret ;  
  }.property().cacheable(),

  /**
    Underlying response class to actually handle this request.  Currently the
    only supported option is SC.XHRResponse which uses a traditional
    XHR transport.
    
		@default SC.XHRResponse
    @property {SC.Response}
  */
  responseClass: SC.XHRResponse,

  /**
    The original request for copied requests.
    
		@default null
    @property {SC.Request}
  */
  source: null,
  
  /**
    The URL this request to go to.
    
		@default null
    @property {String}
  */
  address: null,
  
  /**
    The HTTP method to use.
    
		@default GET
    @param {String}
  */
  type: 'GET',
  
  /**
    An optional timeout value of the request, in milliseconds.  The timer
    begins when SC.Response#fire is actually invoked by the request manager
    and not necessarily when SC.Request#send is invoked.  If this timeout is
    reached before a response is received, the equivalent of
    SC.Request.manager#cancel() will be invoked on the SC.Response instance
    and the didReceive() callback will be called.

    An exception will be thrown if you try to invoke send() on a request that
    has both a timeout and isAsyncronous set to NO.
    
		@default null
    @property {Number}
  */
  timeout: null,
  
  /**
    The body of the request.  May be an object is isJSON or isXML is set,
    otherwise should be a string.

		@property {Object|String}
  */
  body: null,
  
  /**
    The body, encoded as JSON or XML if needed.

		@property {Object|String}
  */
  encodedBody: function() {
    // TODO: support XML
    var ret = this.get('body');
    if (ret && this.get('isJSON')) ret = SC.json.encode(ret);
    return ret ;
  }.property('isJSON', 'isXML', 'body').cacheable(),

  // ..........................................................
  // CALLBACKS
  // 
  
  /**
    Invoked on the original request object just before a copied request is 
    frozen and then sent to the server.  This gives you one last change to 
    fixup the request; possibly adding headers and other options.
    
    If you do not want the request to actually send, call cancel().
    
    @param {SC.Request} request A copy of the request object, not frozen
    @param {SC.Response} response The object that will wrap the response
  */
  willSend: function(request, response) {},
  
  /**
    Invoked on the original request object just after the request is sent to
    the server.  You might use this callback to update some state in your 
    application.
    
    The passed request is a frozen copy of the request, indicating the 
    options set at the time of the request.

    @param {SC.Request} request A copy of the request object, frozen
    @param {SC.Response} response The object that will wrap the response
		@returns BOOL YES on success, NO on failure
  */
  didSend: function(request, response) {},
  
  /**
    Invoked when a response has been received but not yet processed.  This is
    your chance to fix up the response based on the results.  If you don't
    want to continue processing the response call response.cancel().

    @param {SC.Request} request A copy of the request object, frozen
    @param {SC.Response} response The object that will wrap the response
  */
  willReceive: function(request, response) {},
  
  /**
    Invoked after a response has been processed but before any listeners are
    notified.  You can do any standard processing on the request at this 
    point.  If you don't want to allow notifications to continue, call
    response.cancel()

    @param {SC.Request} request A copy of the request object, frozen
    @param {SC.Response} response The object that will wrap the response
  */
  didReceive: function(request, response) {},
  
  // ..........................................................
  // HELPER METHODS
  // 

  concatenatedProperties: 'COPY_KEYS',

  COPY_KEYS: ['isAsynchronous', 'isJSON', 'isXML', 'address', 'type', 'timeout', 'body', 'responseClass', 'willSend', 'didSend', 'willReceive', 'didReceive'],
  
  /**
    Returns a copy of the current request.  This will only copy certain
    properties so if you want to add additional properties to the copy you
    will need to override copy() in a subclass.
    
    @returns {SC.Request} new request
  */
  copy: function() {
    var ret = {},
        keys = this.COPY_KEYS,
        loc  = keys.length, 
        key, listeners, headers;
        
    while(--loc>=0) {
      key = keys[loc];
      if (this.hasOwnProperty(key)) ret[key] = this.get(key);
    }
    
    if (this.hasOwnProperty('listeners')) {
      ret.listeners = SC.copy(this.get('listeners'));
    }
    
    if (this.hasOwnProperty('_headers')) {
      ret._headers = SC.copy(this._headers);
    }
    
    ret.source = this.get('source') || this ;
    
    return this.constructor.create(ret);
  },
  
  /**
    To set headers on the request object.  Pass either a single key/value 
    pair or a hash of key/value pairs.  If you pass only a header name, this
    will return the current value of the header.
    
    @param {String|Hash} key
    @param {String} value
    @returns {SC.Request|Object} receiver
  */
  header: function(key, value) {
    var headers;
    
    if (SC.typeOf(key) === SC.T_STRING) {
      headers = this._headers ;
      if (arguments.length===1) {
        return headers ? headers[key] : null;
      } else {
        this.propertyWillChange('headers');
        if (!headers) headers = this._headers = {};
        headers[key] = value;
        this.propertyDidChange('headers');
        return this;
      }
    
    // handle parsing hash of parameters
    } else if (value === undefined) {
      headers = key;
      this.beginPropertyChanges();
      for(key in headers) {
        if (!headers.hasOwnProperty(key)) continue ;
        this.header(key, headers[key]);
      }
      this.endPropertyChanges();
      return this;
    }

    return this ;
  },

  /**
    Converts the current request to be asynchronous.

    @param {Boolean} flag YES to make asynchronous, NO or undefined
    @returns {SC.Request} receiver
  */
  async: function(flag) {
    if (flag === undefined) flag = YES;
    return this.set('isAsynchronous', flag);
  },

  /**
    Sets the maximum amount of time the request will wait for a response.

    @param {Number} timeout The timeout in milliseconds.
    @returns {SC.Request} receiver
  */
  timeoutAfter: function(timeout) {
    return this.set('timeout', timeout);
  },

  /**
    Converts the current request to use JSON.
    
    @param {Boolean} flag YES to make JSON, NO or undefined
    @returns {SC.Request} receiver
  */
  json: function(flag) {
    if (flag === undefined) flag = YES;
    if (flag) this.set('isXML', NO);
    return this.set('isJSON', flag);
  },
  
  /**
    Converts the current request to use XML.
    
    @param {Boolean} flag YES to make XML, NO or undefined
    @returns {SC.Request} recevier
  */
  xml: function(flag) {
    if (flag === undefined) flag = YES ;
    if (flag) this.set('isJSON', NO);
    return this.set('isXML', flag);
  },
  
  /** 
    Called just before a request is enqueued.  This will encode the body 
    into JSON if it is not already encoded.
  */
  _prep: function() {
    var hasContentType = !!this.header('Content-Type');
    if (this.get('isJSON') && !hasContentType) {
      this.header('Content-Type', 'application/json');
    } else if (this.get('isXML') && !hasContentType) {
      this.header('Content-Type', 'text/xml');
    }
    return this ;
  },
  
  /**
    Will fire the actual request.  If you have set the request to use JSON 
    mode then you can pass any object that can be converted to JSON as the 
    body.  Otherwise you should pass a string body.
    
    @param {String|Object} body (optional)
    @returns {SC.Response} new response object
  */  
  send: function(body) {
    // Sanity-check:  Be sure a timeout value was not specified if the request
    // is synchronous (because it wouldn't work).
    var timeout = this.get('timeout');
    if (timeout) {
      if (!this.get('isAsynchronous')) throw "Timeout values cannot be used with synchronous requests";
    }
    else if (timeout === 0) {
      throw "The timeout value must either not be specified or must be greater than 0";
    }
    
    if (body) this.set('body', body);
    return SC.Request.manager.sendRequest(this.copy()._prep());
  },

  /**
    Resends the current request.  This is more efficient than calling send()
    for requests that have already been used in a send.  Otherwise acts just
    like send().  Does not take a body argument.
    
    @returns {SC.Response} new response object
  */
  resend: function() {
    var req = this.get('source') ? this : this.copy()._prep();
    return SC.Request.manager.sendRequest(req);
  },
  
  /**
    Configures a callback to execute when a request completes.  You must pass
    at least a target and action/method to this and optionally a status code.
    You may also pass additional parameters which will be passed along to your
    callback. If your callback handled the notification, it should return YES.
    
    Scoping With Status Codes
    ------
    
    If you pass a status code as the first option to this method, then your 
    notification callback will only be called if the response status matches
    the code.  For example, if you pass 201 (or SC.Request.CREATED) then 
    your method will only be called if the response status from the server
    is 201.
    
    You can also pass "generic" status codes such as 200, 300, or 400, which
    will be invoked anytime the status code is the range if a more specific 
    notifier was not registered first and returned YES.  
    
    Finally, passing a status code of 0 or no status at all will cause your
    method to be executed no matter what the resulting status is unless a 
    more specific notifier was registered and returned YES.
    
    Callback Format
    ------
    
    Your notification callback should expect to receive the Response object
    as the first parameter plus any additional parameters that you pass.  
    
    @param {Number} status
    @param {Object} target
    @param {String|function} action
    @param {Hash} params
    @returns {SC.Request} receiver
  */
  notify: function(status, target, action, params) {
    
    // normalize status
    var hasStatus = YES ;
    if (SC.typeOf(status) !== SC.T_NUMBER) {
      params = SC.A(arguments).slice(2);
      action = target;
      target = status;
      status = 0 ;
      hasStatus = NO ;
    } else params = SC.A(arguments).slice(3);
    
    var listeners = this.get('listeners');
    if (!listeners) this.set('listeners', listeners = {});
    listeners[status] = { target: target, action: action, params: params };

    return this;
  }
    
});

SC.Request.mixin(/** @scope SC.Request */ {
  
  /**
    Helper method for quickly setting up a GET request.

    @param {String} address url of request
    @returns {SC.Request} receiver
  */
  getUrl: function(address) {
    return this.create().set('address', address).set('type', 'GET');
  },

  /**
    Helper method for quickly setting up a POST request.

    @param {String} address url of request
    @param {String} body
    @returns {SC.Request} receiver
  */
  postUrl: function(address, body) {
    var req = this.create().set('address', address).set('type', 'POST');
    if(body) req.set('body', body) ;
    return req ;
  },

  /**
    Helper method for quickly setting up a DELETE request.

    @param {String} address url of request
    @returns {SC.Request} receiver
  */
  deleteUrl: function(address) {
    return this.create().set('address', address).set('type', 'DELETE');
  },

  /**
    Helper method for quickly setting up a PUT request.

    @param {String} address url of request
    @param {String} body
    @returns {SC.Request} receiver
  */
  putUrl: function(address, body) {
    var req = this.create().set('address', address).set('type', 'PUT');
    if(body) req.set('body', body) ;
    return req ;
  }
});

/**
  @class

  The request manager coordinates all of the active XHR requests.  It will
  only allow a certain number of requests to be active at a time; queuing 
  any others.  This allows you more precise control over which requests load
  in which order.

  @since SproutCore 1.0
*/
SC.Request.manager = SC.Object.create(
	/** @scope SC.Request.manager */{

  /**
    Maximum number of concurrent requests allowed.  6 for all browsers.
    
    @property {Number}
  */
  maxRequests: 6,

  /**
    Current requests that are inflight.
    
    @property {Array}
  */
  inflight: [],
  
  /**
    Requests that are pending and have not been started yet.
  
    @property {Array}
  */
  pending: [],

  // ..........................................................
  // METHODS
  // 
  
  /**
    Invoked by the send() method on a request.  This will create a new low-
    level transport object and queue it if needed.
    
    @param {SC.Request} request the request to send
    @returns {SC.Object} response object
  */
  sendRequest: function(request) {
    if (!request) return null ;
    
    // create low-level transport.  copy all critical data for request over
    // so that if the request has been reconfigured the transport will still
    // work.
    var response = request.get('responseClass').create({ request: request });

    // add to pending queue
    this.get('pending').pushObject(response);
    this.fireRequestIfNeeded();
    
    return response ;
  },

  /** 
    Cancels a specific request.  If the request is pending it will simply
    be removed.  Otherwise it will actually be cancelled.
    
    @param {Object} response a response object
    @returns {Boolean} YES if cancelled
  */
  cancel: function(response) {

    var pending = this.get('pending'),
        inflight = this.get('inflight'),
        idx ;

    if (pending.indexOf(response) >= 0) {
      this.propertyWillChange('pending');
      pending.removeObject(response);
      this.propertyDidChange('pending');
      return YES;
      
    } else if (inflight.indexOf(response) >= 0) {
      
      response.cancel();
      
      inflight.removeObject(response);
      this.fireRequestIfNeeded();
      return YES;

    } else return NO ;
  },  

  /**
    Cancels all inflight and pending requests.  
    
    @returns {Boolean} YES if any items were cancelled.
  */
  cancelAll: function() {
    if (this.get('pending').length || this.get('inflight').length) {
      this.set('pending', []);
      this.get('inflight').forEach(function(r) { r.cancel(); });
      this.set('inflight', []);
      return YES;
      
    } else return NO ;
  },
  
  /**
    Checks the inflight queue.  If there is an open slot, this will move a 
    request from pending to inflight.
    
    @returns {Object} receiver
  */
  fireRequestIfNeeded: function() {
    var pending = this.get('pending'), 
        inflight = this.get('inflight'),
        max = this.get('maxRequests'),
        next ;
        
    if ((pending.length>0) && (inflight.length<max)) {
      next = pending.shiftObject();
      inflight.pushObject(next);
      next.fire();
    }
  },

  /**
    Called by a response/transport object when finishes running.  Removes 
    the transport from the queue and kicks off the next one.
  */
  transportDidClose: function(response) {
    this.get('inflight').removeObject(response);
    this.fireRequestIfNeeded();
  }
  
});

