(function (root) {
    var M,
        store,
        addToStore,
        getFromStore,
        handleMixedArgs,
        removeFromStore,
        cleanUp,
        noop,
        undef,
        isEmpty
    ;
    
    store = [];
    
    noop = function () {};
    //////////////////////////
    //  SPYING AND MOCKING  //
    //////////////////////////
    /**
     * Myrtle
     * 
     * @param  {Object}             obj             Description
     * @param  {String}             fnName          The name of a function
     * @param  {Object}             options         Options for this function
     * @param  {Boolean}            options.spy     Whether the function should be spied upon.
     * @param  {Boolean}            options.profile Whether the function should be profiled.
     * @param  {Boolean|Function}   options.stub    A function to run instead of the original function, or true for no 
     *                                              action, or false to disable stubbing.
     */
    M = function (obj, fnName, options) {
        var fn = obj[fnName],
            info
        ;
        options = options || {};
        if (typeof fn !== 'function') {
            throw new Error("Supplied variable (" + fnName + ") is not a function.");
        }
        info = getFromStore(fn);
        if (!info) {
            info = addToStore(obj, fnName, fn);
        }
        if (typeof options.spy !== 'undefined') {
            info.spy = !!options.spy;
        }
        if (typeof options.profile !== 'undefined') {
            info.profile = !!options.profile;
        }
        if (typeof options.stub !== 'undefined') {
            info.stub = options.stub === true ? null : options.stub;
        }
        return info.api;
    };
    
    M.spy = function (obj, fnName) {
        return M(obj, fnName, {
            spy : true
        });
    };
    
    M.stub = function (obj, fnName, fn) {
        return M(obj, fnName, {
            stub : typeof fn === 'undefined' ? true : fn
        });
    };
    M.profile = function (obj, fnName) {
        return M(obj, fnName, {
            profile : true
        });
    };
    
    M.size = function () {
        return store.length;
    };
    M.releaseAll = function () {
        var info;
        while ((info = store.pop())) {
            cleanUp(info);
        }
    };
    M.hasModified = function (fn) {
        return getFromStore(fn, true) !== -1;
    };

    ////////////////////
    //  TIMERS MODULE //
    ////////////////////
    (function () {
        var counter = 0,
            currentTime = 0,
            queue = {},
            reset
        ;

        reset = function () {
            counter = 0;
            currentTime = 0;
            queue = {};
        };
        
        reset();
        
        M.fakeTimers = function () {
            M.stub(root, 'setTimeout', function (orig, fn, time) {
                var executeAt, id;
                
                time = parseInt(time, 10);
                if (time < 0) {
                    throw new Error("setTimeout can only take time intervals in non-negative integers");
                }
                
                executeAt = currentTime + time;
                
                if (fn.__myrtle_setInterval) {
                    id = fn.__myrtle_setInterval;
                } else {
                    id = ++counter;
                }
                if (typeof queue[executeAt] === 'undefined') {
                    queue[executeAt] = {};
                }
                queue[executeAt][id] = fn;
                return id;
            });
            
            M.stub(root, 'clearTimeout', function (orig, id) {
                var t;
                if (id && id <= counter) {
                    for (t in queue) {
                        if (queue.hasOwnProperty(t)) {
                            if (typeof queue[t][id] !== 'undefined') {
                                delete queue[t][id];
                                if (isEmpty(queue[t])) {
                                    delete queue[t];
                                }
                                return;
                            }
                        }
                    }
                }
            });
            
            M.stub(root, 'setInterval', function (orig, fn, time) {
                var id, wrapped;

                time = parseInt(time, 10);
                if (time <= 0) {
                    throw new Error("setInterval can only take time intervals in positive integers");
                }
                
                wrapped = function () {
                    fn.call(root);
                    root.setTimeout(wrapped, time);
                };
                id = root.setTimeout(wrapped, time);
                wrapped.__myrtle_setInterval = id;
                return id;
            });
            M.stub(root, 'clearInterval', function (orig, id) {
                root.clearTimeout(id);
            });
        };
        
        M.realTimers = function () {
            M(root, 'setTimeout').release();
            M(root, 'clearTimeout').release();
            M(root, 'setInterval').release();
            M(root, 'clearInterval').release();
            reset();
        };
        
        M.tick = function (time) {
            var f, destination;
            //i = currentTime;
            //currentTime += time;
            destination = currentTime + time;
            
            if (isEmpty(queue)) {
                return;
            }
            // TODO: this is probably highly inefficient...
            for (; currentTime <= destination; ++currentTime) {
                if (queue.hasOwnProperty(currentTime)) {
                    for (f in queue[currentTime]) {
                        if (queue[currentTime].hasOwnProperty(f)) {
                            queue[currentTime][f].call(root);
                        }
                    }
                    delete queue[currentTime];
                }
            }
            currentTime = destination;
        };
    }());
    

    getFromStore = function (fn, indexOnly) {
        var i, l;
        for (i = 0, l = store.length; i < l; ++i) {
            if (store[i].origObj[store[i].origFnName] === fn) {
                return indexOnly ? i : store[i];
            }
        }
        return indexOnly ? -1 : undef;
    };
    removeFromStore = function (fn) {
        var ind = getFromStore(fn, true),
            info
        ;
        if (ind !== -1) {
            info = store.splice(ind, 1)[0];
            cleanUp(info);
        }
    };
    cleanUp = function (info) {
        var i;
        if (info.wasOwnFn) {
            // if the function existed on the object originally (not on its prototype), then put it back.
            info.origObj[info.origFnName] = info.origFn;
        } else {
            // otherwise, just remove the function we added.
            delete info.origObj[info.origFnName];
        }
        for (i in info.api) {
            if (info.api.hasOwnProperty(i)) {
                info.api[i] = noop;
            }
        }
        for (i in info) {
            if (info.hasOwnProperty(i)) {
                delete info[i];
            }
        }
    };
    /**
     * Add a function into the store and get its meta data back
     * @param  {Function} addToStore
     * @return {Object}
     */
    addToStore = function (obj, fnName, fn) {
        var info = {
            origObj : obj,                          // the object which holds the function
            origFnName : fnName,                    // the name of the function on that object
            origFn : fn,                            // the original function
            wasOwnFn : obj.hasOwnProperty(fnName),  // whether the function existed on that object directly or not
                                                    // USER SET OPTIONS:
            stub : false,                           // Whether this function is being stubbed.
            profile : false,                        // Whether this function is being profiled.
            spy : false,                            // Whether this function is being spied upon.
            
            history : []                            // Data about each call to this function
        };
        obj[fnName] = function () {
            var ret, args, boundFn, startTime, error;
            
            // get the arguments passed to this function
            args = Array.prototype.slice.apply(arguments);
            
            boundFn = function () {
                return info.origFn.apply(info.origObj, arguments);
            };
            
            // execute the original function, or the stub
            if (info.profile) {
                startTime = new Date();
            }
            try {
                ret = (info.stub === false)
                    ? info.origFn.apply(this, args)
                    : (info.stub
                       ? info.stub.apply(this, [boundFn].concat(args))
                       : undef
                    )
                ;
            } catch (e) {
                error = e;
            }
            if (info.spy || info.profile) {
                info.history.push({
                    time   : info.profile && (new Date() - startTime),
                    ret    : info.spy ? ret : undef,
                    args   : info.spy ? args : undef,
                    'this' : this,
                    error  : error
                });
            }
            if (error) {
                throw error;
            } else {
                return ret;
            }
        };
        info.api = {
            callCount : function () {
                return info.history.length;
            },
            last : function () {
                return info.history.length
                     ? info.history[info.history.length - 1]
                     : undef
                ;
            },
            lastReturn : function () {
                var l = this.last();
                return l && l.ret;
            },
            lastArgs : function () {
                var l = this.last();
                return l && l.args;
            },
            lastThis : function () {
                var l = this.last();
                return l && l['this'];
            },
            lastError : function () {
                var l = this.last();
                return l && l.error;
            },
            getHistory : function () {
                return info.history;
            },
            getAverageTime : function () {
                var total = 0, count = 0, i, l, h;
                for (i = 0, l = info.history.length; i < l; ++i) {
                    h = info.history[i];
                    if (h.time !== false) {
                        total += h.time;
                        ++count;
                    }
                }
                return count && (total / count);
            },
            getQuickest : function () {
                var quickest = null, quickestIndex = -1, i, l, h;
                for (i = 0, l = info.history.length; i < l; ++i) {
                    h = info.history[i];
                    if (h.time !== false) {
                        if (quickest === null || h.time < quickest) {
                            quickest = h.time;
                            quickestIndex = i;
                        }
                    }
                }
                return info.history[quickestIndex];
            },
            getSlowest : function () {
                var slowest = null, slowestIndex = -1, i, l, h;
                for (i = 0, l = info.history.length; i < l; ++i) {
                    h = info.history[i];
                    if (h.time !== false) {
                        if (slowest === null || h.time > slowest) {
                            slowest = h.time;
                            slowestIndex = i;
                        }
                    }
                }
                return info.history[slowestIndex];
            },
            reset : function () {
                info.history = [];
            },
            release : function () {
                removeFromStore(obj[fnName]);
            }
        };
        store.push(info);
        return info;
    };
    
    handleMixedArgs = function (args) {
        return args.length === 2
             ? args[0][args[1]]
             : args[0]
        ;
    };
    
    isEmpty = function (obj) {
        var i;
        if (Object.prototype.toString.call(obj) === '[object Array]') {
            return obj.length === 0;
        } else {
            /*jslint forin: true */
            for (i in obj) {
                return false;
            }
            /*jslint forin: false */
            return true;
        }
    };
    
    if (typeof module !== 'undefined') {
        module.exports = M;
    } else {
        root.Myrtle = M;
    }
}(this));