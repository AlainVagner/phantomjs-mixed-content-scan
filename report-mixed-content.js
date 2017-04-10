#!/usr/bin/env ./node_modules/phantomjs/bin/phantomjs --disk-cache=true --ignore-ssl-errors=false --load-images=true --output-encoding=utf-8
'use strict';

var system = require('system'),
    webpage = require('webpage'),
    fs = require('fs');

console.warn = function () {
    system.stderr.write(Array.prototype.join.call(arguments, ' ') + '\n');
};

if (system.args.length < 3) {
    console.log('Usage:', args[0], '-u URL | -f file');
    phantom.exit(1);
}

var credentials;
try {
    var config = fs.read('./config.json').toString();
    if (config !== undefined) {
        config = JSON.parse(config);
        if (config['credentials'] !== undefined) {
            credentials = config['credentials'];
        }
    }
} catch (e) {
    console.warn('config.json does not exist');
}

var URLs = [];
if (system.args[1] == '-u') {
    URLs.push(system.args[2]);
} else {
    var args = fs.read(system.args[2]).toString().split("\n");
    args.forEach(function(url) {
    if (url !== '' && url.substr(0, 8) !== 'https://') {
        console.warn('Rewriting HTTP URL to use HTTPS:', url);
        url = url.replace('http:', 'https:');
    }

    URLs.push(url);
    });
} 

function initPage() {
    var page = new WebPage();
    
    if (credentials !== undefined) {
        page.settings.userName = credentials.login;
        page.settings.password = credentials.password;
    }

    page.onResourceRequested = function(requestData, networkRequest) {
        var originalURL = currentURL = requestData.url;

        var currentPageURL = page.url || page.originalURL;

        if (currentURL.substr(0, 8) !== 'https://' && currentURL.substr(0, 5) !== 'data:') {
            console.log('error-loaded-insecure-res,', currentPageURL, ',', originalURL);
        }
    };

    page.onError = function (msg, trace) {
        logError('page-error,', msg);
        trace.forEach(function(item) {
            logError('  ', item.file, ':', item.line);
        });
    };

    page.onConsoleMessage = function(msg) {
        if (msg == 'GOTO_NEXT_PAGE') {
            page.close();
            crawlNextPage();
        } else if (msg.indexOf('insecure content from') >= 0) {
            // We can format WebKit's native error messages nicely:
            console.log('error-displayed-insecure-content,', page.originalURL, ',', msg.trim().replace('about:blank', '').replace('The page at ', '').replace(' displayed insecure content from', ' ').replace(/\.$/, ''));
        } else {
            console.log('log,', msg);
        }
    };

    return page;
}

function crawlNextPage() {
    if (URLs.length < 1) {
        console.warn('… done!');
        phantom.exit();
    }

    var url = URLs.shift();
    var page = initPage();

    console.warn('Opening', url, '(' + URLs.length + ' remaining)');

    page.onInitialized = function() {
        page.evaluate(function(startTime) {
            /* global window */

            // This can happen with things like error pages which have no linked resources to load by the
            // time that our JavaScript starts executing:
            if (document.readyState == 'complete') {
                console.log('GOTO_NEXT_PAGE');
            }

            document.addEventListener('DOMContentLoaded', function() {
                 var docHeight = Math.max(
                    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
                    Math.max(document.body.offsetHeight, document.documentElement.offsetHeight),
                    Math.max(document.body.clientHeight, document.documentElement.clientHeight) 
                );
                //console.log('DOMContentLoaded', ((Date.now() - startTime) / 1000).toFixed(3) + 's');
                // scroll down the page to manage lazy loading cases
                document.currentPos = 0;
                var lastPos = -1;
                var timer = setInterval(function() {
                    document.currentPos += 400;
                    var lastPos = window.scrollY;
                    window.scrollTo(0, document.currentPos);
                    
                    if (lastPos == window.scrollY) {
                        //console.log('stop ' + lastPos);
                        clearInterval(timer);
                        window.setTimeout(function () {
                            //console.log('finished scrolling')
                            console.log('GOTO_NEXT_PAGE');
                        }, 1000);
                    }
                    //console.log(document.currentPos);
                }, 10);
            });

            //window.addEventListener('load', function() {
            //    console.log('load', ((Date.now() - startTime) / 1000).toFixed(3) + 's');
            //});

            window.setTimeout(function () {
                //console.warn('👎 Aborting page load after one minute');
                console.log('GOTO_NEXT_PAGE');
            }, 60 * 1000);

        }, Date.now());
    };

    page.originalURL = url;

    page.open(url, function (status) {
        if (status === 'success') {
            console.warn('✅ ', url);
            // Do nothing at this point until the load event fires
        } else {
            console.warn('❌ ', url);

            page.close();
            crawlNext();
        }
    });
}

crawlNextPage();
