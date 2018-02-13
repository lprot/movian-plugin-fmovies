/**
 * BMovies plugin for Movian Media Center
 *
 *  Copyright (C) 2018 lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var page = require('showtime/page');
var service = require('showtime/service');
var settings = require('showtime/settings');
var http = require('showtime/http');
var io = require('native/io');
var string = require('native/string');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;

RichText = function(x) {
    this.str = x.toString();
}

RichText.prototype.toRichString = function(x) {
    return this.str;
}

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.108 Safari/537.36';

var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';
function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = title;
        page.metadata.logo = logo;
    }
    page.model.contents = 'grid';
    page.type = "directory";
    page.contents = "items";
}

service.create(plugin.title, plugin.id + ":start", 'video', true, logo);

settings.globalSettings(plugin.id, plugin.title, logo, plugin.synopsis);
settings.createString('baseURL', "Base URL without '/' at the end", 'https://bmovies.to', function(v) {
    service.baseURL = v;
});
settings.createBool('debug', 'Enable debug logging',  false, function(v) {
    service.debug = v;
});

function trim(s) {
    if (s) return s.replace(/(\r\n|\n|\r)/gm, "").replace(/(^\s*)|(\s*$)/gi, "").replace(/[ ]{2,}/gi, " ").replace(/\t/g,'');
    return '';
}

function getTheList(blob) {
    var tmp = '', first = 0;
    if (blob) {
        re = /<a href=[\s\S]*?">([\s\S]*?)<\/a>/g;
        var match = re.exec(blob);
        while (match) {
            if (!first) {
                tmp += trim(match[1].replace(/>/g, ''));
                first++;
            } else
                tmp += ', ' + trim(match[1].replace(/>/g, ''));
            match = re.exec(blob);
        }
    }
    return tmp;
}

new page.Route(plugin.id + ":indexItem:(.*):(.*):(.*)", function(page, url, title, series) {
    setPageHeader(page, unescape(title));
    page.model.contents = 'list';
    page.loading = true;
    log('Indexing: ' + service.baseURL + unescape(url));
    var doc = http.request(service.baseURL + unescape(url), {
         headers: {
             referer: service.baseURL,
             'user-agent': UA
         }
    }).toString();

    var background = doc.match(/background-image:[\s\S]*?url=([\s\S]*?)'/);
    if (background) {
        page.metadata.background = background[1];
        page.metadata.backgroundAlpha = 0.3;
    }

    // 1-icon, 2-imdb rating, 3-duration, 4-description, 5-genres blob, 6-actors blob, 
    // 7-director, 8-country blob, 9-rating, 10-views, 11-released, 12-quality
    var match = doc.match(/<div id="info"[\s\S]*?<img src="([\s\S]*?)"[\s\S]*?class="imdb">[\s\S]*?<b>([\s\S]*?)<\/b>[\s\S]*?fa-clock-o">[\s\S]*?<b>([\s\S]*?)min[\s\S]*?class="desc">([\s\S]*?)<\/div>[\s\S]*?<dd>([\s\S]*?)<\/dd>[\s\S]*?<dd>([\s\S]*?)<\/dd>[\s\S]*?<dd>([\s\S]*?)<\/dd>[\s\S]*?<dd>([\s\S]*?)<\/dd>[\s\S]*?class="rating">[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<dd>([\s\S]*?)<\/dd>[\s\S]*?class="quality">([\s\S]*?)<\/span>/);
    var stars = match[6];
    page.appendItem(string.entityDecode(match[1]), 'video', {
        title: unescape(title),
        icon: page.metadata.logo = string.entityDecode(match[1]),
        duration: trim(match[3]) != 'na' ? match[3] * 60 : 0,
        rating: match[9] * 10,
        genre: new RichText(getTheList(match[5]) +
            coloredStr('<br>Country: ', orange) + getTheList(match[8]) +
            (trim(match[7]) != '...' ? coloredStr('<br>Director: ', orange) + trim(match[7]).replace(/,/g, ', ')  : '')),
        year: +match[11].substring(0, 4),
        tagline: new RichText(coloredStr('Released: ', orange) + trim(match[11]) +
            coloredStr(' Views: ', orange) + trim(match[10])),
        description: new RichText(
            //(trim(getTheList(stars)) ? coloredStr('Actors: ', orange) + getTheList(stars) : '') +
            (trim(match[4]) ? trim(match[4]).replace(/<p>/g, '') : ''))
    });
    var ts = doc.match(/data-ts="([\s\S]*?)">/)[1];

    // 1-server, 2-server name, 3-episodes blob
    var re = /<div class="server row"[\s\S]*?data-id="([\s\S]*?)"[\s\S]*?<\/i>([\s\S]*?)<\/label>[\s\S]*?<ul class="episodes([\s\S]*?)<\/ul>/g;    
    match = re.exec(doc);
    while (match) {
        // 1-id, 2-referer, 3-title
        var re2 = /data-id="([\s\S]*?)"[\s\S]*?href="([\s\S]*?)">([\s\S]*?)<\/a>/g;
        var match2 = re2.exec(match[3]);
        while (match2) {
            //ts, id, server, referer, title
            page.appendItem(plugin.id + ':play:' + ts + ':' + match2[1] + ':' + match[1] + ':' + match2[2] + ':' + title + (+series ? ' - Episode ' + match2[3] : ''), 'video', {
                title: new RichText((+series ? 'Episode ' : '') + match2[3] + coloredStr(' (' + match[2].trim() + ')', orange))
            });
            match2 = re2.exec(match[3]);
        }              
        match = re.exec(doc);
    }

    // actors
    if (stars) {
        page.appendItem("", "separator", {
            title: 'Actors:'
        });
        //1-link, 2-page header, 3-star's name
        re = /<a href="([\s\S]*?)"[\s\S]*?title="([\s\S]*?)">([\s\S]*?)<\/a>/g;
        var star = re.exec(stars);
        while (star) {
            page.appendItem(plugin.id + ':loadFromURL:' + escape(star[1]) + ':' + escape(star[2]), 'video', {
                title: trim(star[3].replace(/>/g, ''))
            });
            star = re.exec(stars);
        }
    }

    page.appendItem("", "separator", {
        title: 'You might also like:'
    });
    scraper(page, doc);
    page.loading = false;
});

function log(str) {
    if (service.debug) console.log(str);
}

// Search IMDB ID by title
function getIMDBid(title) {
    var imdbid = null;
    var title = string.entityDecode(unescape(title)).toString();
    log('Splitting the title for IMDB ID request: ' + title);
    var splittedTitle = title.split('|');
    if (splittedTitle.length == 1)
        splittedTitle = title.split('/');
    if (splittedTitle.length == 1)
        splittedTitle = title.split('-');
    log('Splitted title is: ' + splittedTitle);
    if (splittedTitle[1]) { // first we look by original title
        log('Trying to get IMDB ID for: ' + cleanTitle);
        resp = http.request('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(cleanTitle)).toString();
        imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
        if (!imdbid && cleanTitle.indexOf('/') != -1) {
            splittedTitle2 = cleanTitle.split('/');
            for (var i in splittedTitle2) {
                log('Trying to get IMDB ID (1st attempt) for: ' + splittedTitle2[i].trim());
                resp = http.request('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(splittedTitle2[i].trim())).toString();
                imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
                if (imdbid) break;
            }
        }
    }
    if (!imdbid)
        for (var i in splittedTitle) {
            if (i == 1) continue; // we already checked that
            var cleanTitle = splittedTitle[i].trim();
            log('Trying to get IMDB ID (2nd attempt) for: ' + cleanTitle);
            resp = http.request('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(cleanTitle)).toString();
            imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
            if (imdbid) break;
        }

    if (imdbid) {
        log('Got following IMDB ID: ' + imdbid[1]);
        return imdbid[1];
    }
    log('Cannot get IMDB ID :(');
    return imdbid;
};

function r(t) {
    var i, n = 0;
    for (i = 0; i < t.length; i++) 
	n += t.charCodeAt(i) + i;
    return n
}
			
function a(t, i) {
    var n, e = 0;
    for (n = 0; n < Math.max(t.length, i.length); n++) 
        e += n < i.length ? i.charCodeAt(n) : 0, e += n < t.length ? t.charCodeAt(n) : 0;
    return e.toString(16)
}

function getOpenLoadStream(doc) {
    var window = this, navigator = {}, jQuery;
    var document = {};
    document.getElementById  = '[native code';
    document.documentElement = {};
    document.documentElement.getAttribute = function() { return 0 };
    var decryptedUrl = 0;

    var $ = function(selector) {
        log("$(" + JSON.stringify(selector) + ") called");
        if (selector.toString().match(/#streamur/)) {
            return {
                text: function(result) {
                    log("$('" + selector + "').text() called. Result: " + result);
                    decryptedUrl = 'https://openload.co/stream/' + result + '?mime=true';
                }
            }
        } else if (selector == '#' + window.z) {
            return {
                text: function() {
                    return encoded;
                }
            }
        } else if (selector == document) {
            return {
                ready: function(func) {
                    func();
                }
            }
        } else 
            console.log('unknown selector is called: ' + selector);
    }

    // 1-id, 2-encoded
    var match = doc.match(/<span style="" id="([\s\S]*?)">([\s\S]*?)<\/span>/);
    window.z = match[1];
    var encoded = match[2];
    var decoder = doc.match(/\('_'\);([\s\S]*?)\uFF9F\u03C9\uFF9F/)[1].replace(/\|\|\!/g, '&&').replace(/window\.\$/, '$');
    eval(decoder);
    return decryptedUrl;
}

new page.Route(plugin.id + ":play:(.*):(.*):(.*):(.*):(.*)", function(page, ts, id, server, referer, title) {
    page.loading = true;
    page.type = 'video';

    var o = {'ts': ts, 'id': id, 'server': server};

    var hash = "iQDWcsGqN";
    var s = r(hash);
    for (n in o)  
        s += r(a(hash + n, o[n]));
    log(JSON.stringify(o) + ' _= ' + s);
    doc = http.request(service.baseURL + '/ajax/episode/info?ts=' + ts + '&_=' + s + '&id=' + id + '&server=' + server, {
         headers: {
             referer: service.baseURL + referer,
             'user-agent': UA,
             'x-requested-with': 'XMLHttpRequest'
         }
    }).toString();
    log(doc);
    var json = JSON.parse(doc);
    var target = json.target + '&autostart=true';
    log(target);
    var subtitle = json.subtitle;
    log(subtitle);
    doc = http.request(target, {
         headers: {
             referer: service.baseURL + referer,
             'user-agent': UA
         }
    }).toString();
    log(doc);

    mimetype = 'video/quicktime';
    var lnk = doc.match(/"file":"([\s\S]*?)"/);
    if (lnk) {
        var host = lnk[1].replace('http://','').replace('https://','').split(/[/?#]/)[0];
        lnk = 'hls:' + lnk[1];
        mimetype = 'application/vnd.apple.mpegurl'
        io.httpInspectorCreate('.*' + host.replace(/\./g, '\\.') + '.*', function(req) {
            req.setHeader('Host', req.url.replace('http://','').replace('https://','').split(/[/?#]/)[0]);
            req.setHeader('Origin', 'https://mcloud.to');
            req.setHeader('Referer', target);
            req.setHeader('User-Agent', UA);
        });
    } 
    if (!lnk) {
        lnk = getOpenLoadStream(doc);
        var host = lnk.replace('http://','').replace('https://','').split(/[/?#]/)[0];
        io.httpInspectorCreate('.*' + host.replace(/\./g, '\\.') + '.*', function(req) {
            req.setHeader('Referer', target);
            req.setHeader('User-Agent', UA);
        });
        io.httpInspectorCreate('.*oloadcdn\\.net.*', function(req) {
            req.setHeader('Host', req.url.replace('http://','').replace('https://','').split(/[/?#]/)[0]);
            req.setHeader('Origin', 'https://openload.co');
            req.setHeader('Referer', target);
            req.setHeader('User-Agent', UA);
        });
    }

    var imdbid = getIMDBid(title);

    var videoparams = {
        title: unescape(title),
        imdbid: imdbid,
        canonicalUrl: plugin.id + ':play:' + ts + ':' + id + ':' + server + ':' + referer + ':' + title,
        sources: [{
            url: lnk,
            mimetype: mimetype
        }],
        no_fs_scan: true,
        subtitles: []
    };
    if (subtitle) { 
        videoparams.subtitles.push({
            url: subtitle,
            language: 'eng',
            source: service.baseURL,
            title: unescape(title)
        });
    };
    page.source = "videoparams:" + JSON.stringify(videoparams);
    page.loading = false;
});

var doc = 0;

function addSection(page, sectionName, widgetName) {
    var re = new RegExp('<div class="widget ' + widgetName + '">([\\s\\S]*?)<\/div> <\/div> <\/div>');
    var blob = re.exec(doc);
    if (blob) {
        page.appendItem("", "separator", {
            title: sectionName
        });
        scraper(page, blob[1]);
        var more = blob[1].match(/<a class="more" href="([\s\S]*?)">/);
        if (more)
            page.appendItem(plugin.id + ':loadFromURL:' + escape(more[1]) + ':' + escape(sectionName), 'video', {
                title: 'View all ►',
                icon: 'https://www.stovekraft.com/images/pigeon/view_all_pigeon.jpg'
            });
    }
}

new page.Route(plugin.id + ":start", function(page) {
    setPageHeader(page, plugin.synopsis);
    page.loading = true;
    doc = http.request(service.baseURL + (service.baseURL.match(/bmovies/) ? '/bmovies' : ''), {
        headers: {
            'User-Agent': UA
        }
    }).toString();
    var match = doc.match(/<meta property="og:url" content="([\s\S]*?)"/);
    if (match && (service.baseURL != match[1])) 
         service.baseURL = match[1]
    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Search in ' + service.baseURL
    });
    addSection(page, 'SUGGESTIONS', 'recommend');
    addSection(page, 'LATEST MOVIES', 'latest-movies');
    addSection(page, 'LATEST TV-SERIES', 'latest-series');
    addSection(page, 'REQUESTED MOVIES', 'requested');
    page.loading = false;
});

function scraper(page, blob) {
    // 1-tooltip url, 2-quality/status, 3-icon, 4-url, 5-title 
    var re = /<div class="item" data-tip="([\s\S]*?)"> <div class="([\s\S]*?)<\/div>[\s\S]*?<img src="([\s\S]*?)"[\s\S]*?<a class="name" href="([\s\S]*?)">([\s\S]*?)<\/a>/g;
    var match = re.exec(blob), first = true;
    while (match) {
        var status = match[2].match(/<span>([\s\S]*?)<\/span>/);
        var series = '0'; 
        if (status) {
            status = 'Eps ' + status[1];
            series = '1';
        } else 
            status = match[2].replace(/quality">/, '');
        page.appendItem(plugin.id + ':indexItem:' + escape(match[4]) + ':' + escape(match[5]) + ':' + series, 'video', {
            title: new RichText(coloredStr(status, orange) + ' ' + match[5]),
            icon: string.entityDecode(match[3])
        });
        page.entries++;                   
        match = re.exec(blob);
    }        
}

function loadFromURL(page, url, title) {
    setPageHeader(page, title);
    page.entries = 0;
    var fromPage = 1, tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
	var doc = http.request(url + fromPage, {
            headers: {
                'User-Agent': UA
            }
        }).toString();
	page.loading = false;
        if (!doc.match(/<div class="item"/)) return tryToSearch = false;
        scraper(page, doc);
        fromPage++;
	return true;
    };
    loader();
    page.paginator = loader;
    page.loading = false;
}

new page.Route(plugin.id + ":loadFromURL:(.*):(.*)", function(page, url, title) {
    loadFromURL(page, unescape(url) + '?page=', unescape(title));
});

new page.Route(plugin.id + ":search:(.*)", function(page, query) {
    loadFromURL(page, service.baseURL + '/search?keyword=' + query.replace(/\s/g, '\+') + '&page=', plugin.title);
});

page.Searcher(plugin.id, logo, function(page, query) {
    loadFromURL(page, service.baseURL + '/search?keyword=' + query.replace(/\s/g, '\+') + '&page=', plugin.title);
});
