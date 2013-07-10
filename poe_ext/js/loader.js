/* jshint multistr:true, sub:true, forin:false */
/* global
    $,
    jQuery,
    parseItems,
    initCache,
    getCache,
    setCache,
    resetCache,
    removeFromCache,
    sortUL,
    processItems */

(function(w) {
    "use strict";

    ///
    /// NOTE::: The below will probably need to move to exports
    ///

    var numTabs = 0;
    var oTabs = {};
    var oLeagueChars = {};

    var currentItems = null;
    var postThrottle = null;

    var lastView = '#openRareList';
    var aVisibleCols = [];

    // Exports

    // TODO: Refactor
    w.currentLeague = '';

    // set in parseItem
    w.oTypes = {};
    w.oRarity = {};
    w.oProps = {};
    w.oRequired = {};
    w.oMods = {};
    w.oCalc = {};


    $(document)
        .ready(function() {

            // get the version to display in the UI
            $.getJSON('manifest.json', function(manifest) {
                $('#version')
                    .html("Version: " + manifest.version);
            });

            // $.getJSON(chrome.extension.getURL('/item_data.json'),
            //     function(data) {
            //         item_data = data;
            //     });

            postThrottle = new Throttle(35000, 25);

            // initialise the local browser db, once going, start loading data...
            var dbOpenPromise = initCache()
                .done(function(db, event) {
                    loadPageData();
                });

        });

    // load list of chars from server (or cache)
    // callback will select last selected char if there is one in the cache

    function loadPageData() {
        refreshData(function() {
            getCache('last-league')
                .done(function(charName) {
                    $('#leagueSelector li a[title="' + charName + '"]')
                        .trigger('click');
                })
                .fail(function() {
                    // load league with the most chars
                    var league = '';
                    var charCount = 0;
                    for (var l in oLeagueChars) {
                        if (oLeagueChars[l].length > charCount) {
                            charCount = oLeagueChars[l].length;
                            league = l;
                        }
                    }
                    if (league !== '') {
                        $('#leagueSelector li a[title="' + league + '"]')
                        .trigger('click');
                    }

                });
        });
    }

    $('#refresh')
        .click(function() {

            // store charname before we reset list of chars
            var charName = currentLeague;
            var currentView = lastView;
            var aCols = aVisibleCols;

            // clear all stored data
            resetCache(function() {

                // reload characters from server
                refreshData(function() {

                    // reset charName and make sure it still exists
                    setCache('last-league', charName);
                    setCache('last-view', currentView);
                    setCache('inventoryCols', aCols);

                    $('#leagueSelector li a[title="' + charName + '"]')
                        .trigger('click');


                });

            });


        });

    $('#applyPartialRefresh')
        .click(function() {

            var deleteQueue = new PromiseGroup();

            $('#refreshChars input[type=checkbox]:checked, #refreshTabs input[type=checkbox]:checked')
                .each(function(idx, item) {
                    deleteQueue.addPromise(removeFromCache($(item)
                        .val()));
                });
            deleteQueue.completed(function() {
                loadPageData();
            });
        });

    $('#partRefresh')
        .click(function() {

            $('#refreshSelection')
                .modal('show');

        });

    function refreshData(callback) {

        $('#rareList')
            .hide();
        $('div#crafting-content div.crafting-block')
            .hide();
        $('ul.nav li,ul#craftingTabs li')
            .removeClass('active');

        getCache('league-data')

        .done(function(oLeague) {

            oLeagueChars = oLeague;

            getCache('oTabs')
                .done(function(oT) {

                    oTabs = oT;
                    numTabs = oT.length;
                    initPage();
                    if (jQuery.isFunction(callback)) {
                        callback();
                    }

                });

        })

        .fail(function() {

            $.blockUI({
                message: '<h3>Loading...</h3><h4 id="waitOnQueue"></h4>',
                baseZ: 10000
            });

            getChars()
                .done(function(charResp) {

                    if (charResp === null || charResp.error !== undefined || charResp[0] === '<') {
                        showCharError();
                        $.unblockUI();
                        return;
                    }

                    // setCache('chars',charResp);

                    var oLeagues = {};

                    var loadQueue = new PromiseGroup();

                    var throttleQueue = new PromiseGroup();

                    // we have to request each characters items to find out what league they are in
                    $.each(charResp, function(idx, item) {

                        loadQueue.addPromise(
                            getCharItems(item.name)
                            .done(function(oData) {
                                if (oData.hasOwnProperty('character') && oData.character.hasOwnProperty('league')) {
                                    if (!oLeagues.hasOwnProperty(oData.character.league)) {
                                        oLeagues[oData.character.league] = [];
                                    }
                                    oLeagues[oData.character.league].push(item.name);
                                }
                            }));

                    });

                    // all items have been requested (ie not sitting in queue)
                    throttleQueue.completed(function() {
                        // when loading all chars is complete save to cache
                        loadQueue.completed(function() {

                            oLeagueChars = oLeagues;
                            setCache('league-data', oLeagueChars);

                            // look up how many tabs we have
                            for (var league in oLeagues) {

                                if (oLeagues.hasOwnProperty(league)) {

                                    // load first leagues first stash tab to get tab info
                                    getStashPage(league, 0)
                                        .done(function(oStash) {

                                            oTabs = oStash.tabs;
                                            numTabs = oTabs.length;

                                            $.unblockUI();

                                            initPage();

                                            if (jQuery.isFunction(callback)) {
                                                callback();
                                            }

                                        });

                                    break;
                                }
                            }


                        });

                    });

                })

            // failed to load character info
            .fail(function() {
                showCharError();
                $.unblockUI();
            });
        });

    }

    function initPage() {

        var oDD = $('#leagueSelector')
            .empty();

        for (var league in oLeagueChars) {
            oDD.append('<li><a title="' + league + '">' + league + '</a></li>');
        }

        sortUL(oDD);

        oDD.find('a')
            .click(function() {

                var oThis = $(this);
                var league = oThis.text();

                $('#err')
                    .empty();

                currentLeague = league;

                oThis
                    .closest('.dropdown')
                    .addClass('active')
                    .find('a.dropdown-toggle')
                    .html(league + ' League <b class="caret"></b>');

                oThis.parent()
                    .siblings()
                    .removeClass('active');

                oThis.parent()
                    .addClass('active');

                $('#output')
                    .html('');
                $('#rareList')
                    .html('');

                if (league !== '') {
                    setCache('last-league', league);
                    loadLeagueData(league, false);
                }

            });

    }

    function PromiseGroup() {
        var promises = [];

        this.addPromise = function(promise) {
            promises.push(promise);
        };

        this.completed = function(fn) {
            $.when.apply($, promises)
                .done(fn);
        };

        this.failed = function(fn) {
            $.when.apply($, promises)
                .fail(fn);
        };

    }

    //constructor for a new throttle instance

    function Throttle(delayDuration, approxRequestsAllowed) {

        var self = this;

        this.period = delayDuration;
        this.requestsAllowed = approxRequestsAllowed;

        this.delayQueue = [];
        this.currentRequest = null;
        this.completedRequests = 0;
        this.avTime = 0;
        this.countDown = null;
        this.ticks = 0;


        this.updateStatus = function(undefined) {

            var delay = 0;
            var delay_periods = 0;

            if (self.ticks > 0) {
                // period less one sec per tick. + one period for every x outstanding requests.
                delay = self.period - (1000 * self.ticks);
                delay_periods = Math.floor(self.delayQueue.length / self.requestsAllowed);
            } else {
                // requests processed since last theoretical delay + queue length div requests per delay
                delay_periods = Math.floor(((self.completedRequests % self.requestsAllowed) + self.delayQueue.length) / self.requestsAllowed);
            }

            // console.log('req left: ' + self.delayQueue.length + ', delay: ' + delay + ', delay periods: ' + delay_periods);

            delay += delay_periods * self.period;

            var estRemaining = Math.round(((self.avTime * self.delayQueue.length) + delay) / 1000);

            if (estRemaining > 0) {
                $('#waitOnQueue')
                    .html("Estimated time remaining: " + estRemaining + ' seconds');
            } else {
                $('#waitOnQueue')
                    .empty();
            }
        };

        this.runRequest = function() {

            clearInterval(self.countDown);
            self.ticks = 0;

            if (!self.currentRequest) {
                if (self.delayQueue.length) {

                    self.currentRequest = self.delayQueue.shift();

                    var request = self.currentRequest.action;
                    var deferred = self.currentRequest.deferred;
                    var startTime = new Date()
                        .getTime();

                    request()

                    .done(function(result) {

                        if (result.hasOwnProperty('error')) {

                            if (result.error.message.indexOf('too frequently') > -1) {
                                self.delayQueue.push(self.currentRequest);
                                self.currentRequest = null;
                                self.updateStatus(self.period);
                                setTimeout(self.runRequest, self.period);
                                self.countDown = setInterval(function() {
                                    self.ticks++;
                                    self.updateStatus();
                                }, 1000);

                            } else {
                                console.log(typeof result.error.message);
                                console.log('PoE website returned error:');
                                console.log(result.error.message);
                                deferred.reject();
                                self.currentRequest = null;
                                self.runRequest();
                                self.updateStatus();
                            }


                        } else {

                            var endTime = new Date()
                                .getTime();
                            self.avTime = ((self.avTime * self.completedRequests) + (endTime - startTime)) / ++self.completedRequests;
                            deferred.resolve(result);
                            self.currentRequest = null;
                            self.runRequest();
                            self.updateStatus();

                        }

                    })

                    .fail(function() {
                        deferred.reject();
                        self.currentRequest = null;
                        self.runRequest();
                        self.updateStatus();
                    });

                } else {
                    // reset stats as there are no active requests
                    this.completedRequests = 0;
                    this.avTime = 0;
                }
            }
        };

        // queues future calls to delay until the specified timeout (in milliseconds) has passed.
        // used to prevent flooding GGG's servers with too many stash requests in a short time.
        this.queue = function(queued_action) {

            var deferred = $.Deferred();

            self.delayQueue.push({
                action: queued_action,
                deferred: deferred
            });

            if (!self.currentRequest) {
                self.runRequest();
            }

            return deferred.promise();

        };

        // self.updateStatus();
    }

    function showCharError() {
        $('#err')
            .html('Error retrieving character data from <a href="http://pathofexile.com">' +
                'Path of Exile</a>.<p>Please <a href="https://www.pathofexile.com/login">log in</a> and <a href="/">refresh</a> this page.');
    }

    function resetView() {

        // clear existing crafting info
        $('ul#craftingTabs li')
            .remove();
        $('div#crafting-content')
            .empty();

        //clear existing inventory info
        $('#rareList')
            .empty();

        oTypes = {};
        oRarity = {
            normal: '',
            magic: '',
            rare: '',
            unique: '',
            skillGem: '',
            currency: ''
        };
        oProps = {};
        oRequired = {};
        oMods = {};
        oCalc = {};

        // clear reset lists
        $('#refreshChars, #refreshTabs, #craftingIgnoreChars, #craftingIgnoreTabs')
            .empty();

        $('#inventoryMinLevel')
            .val('0');
        $('#inventoryMaxLevel')
            .val('100');

        currentItems = null;

    }
    /* Usage:
checkbox('id', 'value', 'text', true);
checkbox('id', 'value', 'text', true, 'name');
*/

    function checkbox(id, value, text, checked, name) {
        if (!name) {
            name = id;
        }

        var c = checked ? 'checked="checked"' : '';

        return '<label class="checkbox" for="' + id + '"> <input type="checkbox" name="' + name + '" id="' + id + '" value="' + value + '" ' + c + '>' + text + '</label>';
    }



    function loadLeagueData(league) {
        var checked = $('#refreshChars, #refreshTabs, #craftingIgnoreChars, #craftingIgnoreTabs, #craftingLocation')
            .find('input[type=checkbox]:checked');
        resetView();

        $.blockUI({
            message: '<h3>Loading...</h3><h4 id="waitOnQueue"></h4>',
            baseZ: 10000
        });

        getLeagueData(league, oLeagueChars[league])
            .done(function(leagueData) {
                var items = leagueData[0]; // inventory items
                var stashData = leagueData[1]; // `items` + `tabs`

                $.merge(items, stashData.items);

                console.log('NEW DATA -- items: ', items);
                // oTypes this is generated as a SIDE EFFECT of item parsing <-- bad boy
                // console.log('types', oTypes);

                var charNames = oLeagueChars[league];

                // add characters to forms
                for (var i = 0; i < charNames.length; i++) {
                    $('#refreshChars')
                        .append('<li>' + checkbox('char_' + charNames[i], 'char-' + charNames[i], charNames[i]) + '</li>');
                    $('#craftingIgnoreChars')
                        .append('<li>' + checkbox('ignoreChars_' + charNames[i], charNames[i], charNames[i]) + '</li>');
                }

                var tabs = stashData.tabs;

                for (var j = 0; j < tabs.length; j++) {
                    var thisID = 'stash-' + league + '-' + j;
                    var tabName = tabs[j].n;
                    $('#refreshTabs')
                        .append('<li>' + checkbox('refresh-' + thisID, thisID, 'Tab:' + tabName) + '</li>');
                    $('#craftingIgnoreTabs')
                        .append('<li>' + checkbox('ignore-' + thisID, j, 'Tab:' + tabName) + '</li>');
                }

                // recheck anything that was checked before the load
                checked.prop('checked', true);

                processItems(items)
                    .done(function() {
                        getCache('last-view')
                            .done(function(selector) {
                                lastView = selector;
                                $(selector)
                                    .trigger('click');
                            })
                            .fail(function() {
                                $(lastView)
                                    .trigger('click');
                            });
                    });

                $.unblockUI();

            });
    }
    // Bit too complicated. Should be easy to use I hope :)
    /* Usage:

giveMeEverything(foo(123), bar(345), baz(678), console.log)

gme = giveMeEverything();
gme(foo(123), bar(345));
gme(baz(678));
gme(console.log);

gme = giveMeEverything(foo(123))(bar(345))(baz(678));
gme(console.log);

*/

    function giveMeEverything() {
        var promises = [];
        var callback;

        function thenHandler() {
            // console.log('in thenHandler::: ', arguments);
            callback(Array.prototype.slice.call(arguments));
        }

        function self() {
            var arg;
            for (var i = 0; i < arguments.length; i++) {
                arg = arguments[i];

                if (arg instanceof Function) {
                    callback = arg;
                    $.when.apply($, promises)
                        .then(thenHandler, thenHandler);
                } else {
                    promises.push(arg);
                }
            }
            return self;
        }

        self.apply(this, arguments);

        return self;
    }


    // Note: No UI functions here
    // Returns Promise

    function getLeagueData(league, leagueCharacters) {
        var deferred = new $.Deferred();

        giveMeEverything(
            getInventoryItems(leagueCharacters),
            getStashData(league),
            deferred.resolve);

        return deferred.promise();
    }

    function getInventoryItems(leagueCharacters) {
        // debugging
        console.log('in getInventoryItems: ', leagueCharacters);

        var deferred = new $.Deferred();

        var gme = giveMeEverything();

        for (var i = 0; i < leagueCharacters.length; i++) {
            var characterName = leagueCharacters[i];
            gme(getCharacterItems(characterName));
        }

        gme(function(inventories) {
            var items = [];
            var location;
            for (var i = 0; i < inventories.length; i++) {
                location = {
                    section: leagueCharacters[i],
                    page: null,
                    tabIndex: 0
                };
                $.merge(items, parseItems(inventories[i].items, location));
            }
            deferred.resolve(items);
        });

        return deferred.promise();
    }

    function getCharacterItems(characterName) {
        var url = getEndpoint('get-items');
        var data = {
            character: characterName
        };

        return getPOE(url, data);
    }

    function getStashData(league) {
        var deferred = new $.Deferred();
        console.log('in getStashData: ', league);

        getStashTabItems(league, 0)
            .done(function(data) {

                var tabCount = data.numTabs;

                console.log('stash tab count', tabCount);

                var gme = giveMeEverything();

                for (var i = 1; i < tabCount; i++) {
                    gme(getStashTabItems(league, i));
                }

                gme(function(tabs) {
                    // add first tab
                    tabs.unshift(data);

                    console.log('tabs', tabs);

                    var items = [];
                    var location;

                    for (var i = 0; i < tabs.length; i++) {
                        location = {
                            section: 'stash',
                            page: data.tabs[i].n,
                            colour: data.tabs[i].colour,
                            tabIndex: i
                        };
                        $.merge(items, parseItems(tabs[i].items, location));
                    }
                    deferred.resolve({
                        items: items,
                        tabs: data.tabs
                    });
                });
            })
            .fail(deferred.reject);

        return deferred.promise();
    }

    function getStashTabItems(league, index) {
        var url = getEndpoint('get-stash-items');
        var data = {
            league: league,
            tabIndex: index,
            tabs: index === 0 ? 1 : 0
        };

        return getPOE(url, data);
    }

    // returns promise which returns data

    function getPOE(url, data) {
        var deferred = $.Deferred();
        var cacheString = url + JSON.stringify(data);

        getCache(cacheString)

        //cache hit
        .done(function(data) {
            deferred.resolve(data);
        })

        // cache miss
        .fail(function() {
            postThrottle
                .queue(function() {
                    return $.post(url, data);
                })
                .done(function(data) {
                    setCache(cacheString, data);
                    deferred.resolve(data);
                })
                .fail(deferred.reject);
        });

        return deferred.promise();
    }

    function getEndpoint(method) {
        return "http://www.pathofexile.com/character-window/" + method;
    }

    function getChars() {
        var deferred = new $.Deferred();

        $.post(getEndpoint('get-characters'))
            .done(function(data) {
                if (data) {
                    deferred.resolve(data);
                } else {
                    deferred.reject();
                }

            })
            .fail(function() {
                deferred.reject();
            });

        return deferred.promise();
    }

    function getCharItems(charName) {
        var deferred = $.Deferred();

        // first attempt to load from cache
        getCache('char-' + charName)
        //cache hit
        .done(function(oData) {
            deferred.resolve(oData);
        })

        // cache miss
        .fail(function() {

            var thisChar = charName;

            postThrottle.queue(function() {
                return $.post(getEndpoint('get-items'), {
                    character: thisChar
                });
            })
                .done(function(oData) {
                    // add char data to cache
                    oData.charName = thisChar;
                    setCache('char-' + thisChar, oData);
                    deferred.resolve(oData);
                })
                .fail(function() {
                    deferred.reject();
                    return;
                });


        });

        return deferred.promise();
    }


    // returns a promse, which will return the stash page once loaded

    function getStashPage(league, index) {

        var deferred = $.Deferred();

        // first attempt to load from cache
        getCache('stash-' + league + '-' + index)
        //cache hit
        .done(function(oData) {
            deferred.resolve(oData);
        })

        // cache miss
        .fail(function() {

            postThrottle.queue(function() {
                return $.get(getEndpoint('get-stash-items'), {
                    league: league,
                    tabIndex: index,
                    tabs: index === 0 ? 1 : 0
                });
            })

            .done(function(stashResp) {

                if (stashResp.error !== undefined) {
                    // early exit if web server returns the "you've requested too frequently" error
                    deferred.reject();
                    return;
                }

                // if the user hasn't put anything in their tabs/made a char/looted something this seems to return false. bleh.
                if (stashResp === false) {
                    stashResp = {
                        numTabs: 0,
                        items: [],
                        tabs: []
                    };
                }

                if (index === 0) {
                    setCache('oTabs', stashResp.tabs);
                }

                stashResp.tabIndex = index;
                setCache('stash-' + league + '-' + index, stashResp);
                deferred.resolve(stashResp);
            })

            .fail(function() {
                deferred.reject();
                return;
            });


        });

        return deferred.promise();

    }
})(window);