/**
 * FMovies plugin for Movian Media Center
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
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;
var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.108 Safari/537.36';

function colorStr(str, color) {
    return '<font color="' + color + '"> (' + str + ')</font>';
}

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
    page.loading = false;
}

service.create(plugin.title, plugin.id + ":start", 'video', true, logo);

settings.globalSettings(plugin.id, plugin.title, logo, plugin.synopsis);
settings.createString('baseURL', "Base URL without '/' at the end", 'https://fmovies.to', function(v) {
    service.baseURL = v;
});
settings.createBool('debug', 'Enable debug logging',  false, function(v) {
    service.debug = v;
});

new page.Route(plugin.id + ":indexItem:(.*):(.*)", function(page, url, title) {
    setPageHeader(page, plugin.synopsis + ' / ' + unescape(title));
    page.model.contents = 'list';
    page.loading = true;
    var doc = http.request(service.baseURL + unescape(url), {
         headers: {
             referer: service.baseURL,
             'user-agent': UA
         }
    }).toString();

    var ts = doc.match(/data-ts="([\s\S]*?)">/)[1];

    // 1-server, 2-server name, 3-episodes blob
    var re = /<div class="server row"[\s\S]*?data-id="([\s\S]*?)"[\s\S]*?<\/i>([\s\S]*?)<\/label>[\s\S]*?<ul class="episodes([\s\S]*?)<\/ul>/g;    
    var match = re.exec(doc);
    while (match) {
        // 1-id, 2-referer, 3-title
        var re2 = /data-id="([\s\S]*?)"[\s\S]*?href="([\s\S]*?)">([\s\S]*?)<\/a>/g;
        var match2 = re2.exec(match[3]);
        while (match2) {
            //ts, id, server, referer, title
            page.appendItem(plugin.id + ':play:' + ts + ':' + match2[1] + ':' + match[1] + ':' + match2[2] + ':' + title, 'video', {
                title: new showtime.RichText(match2[3] + coloredStr(' (' + match[2].trim() + ')', orange))
            });
            match2 = re2.exec(match[3]);
        }              
        match = re.exec(doc);
    }        
    page.loading = false;
});

function log(str) {
    if (service.debug) showtime.print(str);
}

// Search IMDB ID by title
function getIMDBid(title) {
    var imdbid = null;
    var title = showtime.entityDecode(unescape(title)).toString();
    log('Splitting the title for IMDB ID request: ' + title);
    var splittedTitle = title.split('|');
    if (splittedTitle.length == 1)
        splittedTitle = title.split('/');
    if (splittedTitle.length == 1)
        splittedTitle = title.split('-');
    log('Splitted title is: ' + splittedTitle);
    if (splittedTitle[1]) { // first we look by original title
        var cleanTitle = splittedTitle[1];//.trim();
        var match = cleanTitle.match(/[^\(|\[|\.]*/);
        if (match)
            cleanTitle = match;
        log('Trying to get IMDB ID for: ' + cleanTitle);
        resp = showtime.httpReq('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(cleanTitle)).toString();
        imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
        if (!imdbid && cleanTitle.indexOf('/') != -1) {
            splittedTitle2 = cleanTitle.split('/');
            for (var i in splittedTitle2) {
                log('Trying to get IMDB ID (1st attempt) for: ' + splittedTitle2[i].trim());
                resp = showtime.httpReq('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(splittedTitle2[i].trim())).toString();
                imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
                if (imdbid) break;
            }
        }
    }
    if (!imdbid)
        for (var i in splittedTitle) {
            if (i == 1) continue; // we already checked that
            var cleanTitle = splittedTitle[i].trim();
            var match = cleanTitle.match(/[^\(|\[|\.]*/);
            if (match)
                cleanTitle = match;
            log('Trying to get IMDB ID (2nd attempt) for: ' + cleanTitle);
            resp = showtime.httpReq('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(cleanTitle)).toString();
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

new page.Route(plugin.id + ":play:(.*):(.*):(.*):(.*):(.*)", function(page, ts, id, server, referer, title) {
    page.loading = true;
    page.type = 'video';

    var o = {'ts': ts, 'id': id, 'server': server};

    var hash = "iQDWcsGqN";
    var s = r(hash);
    for (n in o)  
        s += r(a(hash + n, o[n]));
    log(showtime.JSONEncode(o) + ' _= ' + s);
    doc = http.request(service.baseURL + '/ajax/episode/info?ts=' + ts + '&_=' + s + '&id=' + id + '&server=' + server, {
         headers: {
             referer: service.baseURL + referer,
             'user-agent': UA,
             'x-requested-with': 'XMLHttpRequest'
         }
    }).toString();
    var json = showtime.JSONDecode(doc);
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
    var lnk = doc.match(/"file":"([\s\S]*?)"/)[1];
    var host = lnk.replace('http://','').replace('https://','').split(/[/?#]/)[0];
    
    var imdbid = getIMDBid(title);

    io.httpInspectorCreate('.*' + host.replace(/\./g, '\\.') + '.*', function(req) {
        req.setHeader('Host', req.url.replace('http://','').replace('https://','').split(/[/?#]/)[0]);
        req.setHeader('Origin', 'https://mcloud.to');
        req.setHeader('Referer', target);
        req.setHeader('User-Agent', UA);
    });

    page.source = "videoparams:" + showtime.JSONEncode({
        title: unescape(title),
        imdbid: imdbid,
        canonicalUrl: plugin.id + ':play:' + ts + ':' + id + ':' + server + ':' + referer + ':' + title,
        sources: [{
            url: 'hls:' + lnk
        }],
        subtitles: [{
            url: subtitle,
            language: 'eng',
            source: service.baseURL,
            title: unescape(title)
        }],
        no_fs_scan: true
    });
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
    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Search in ' + service.baseURL
    });
    doc = http.request(service.baseURL, {
        headers: {
            'User-Agent': UA
        }
    }).toString();
    addSection(page, 'SUGGESTIONS', 'recommend');
    addSection(page, 'LATEST MOVIES', 'latest-movies');
    addSection(page, 'LATEST TV-SERIES', 'latest-series');
    addSection(page, 'REQUESTED MOVIES', 'requested');
});

function scraper(page, blob) {
    // 1-tooltip url, 2-quality/status, 3-icon, 4-url, 5-title 
    var re = /<div class="item" data-tip="([\s\S]*?)"> <div class="([\s\S]*?)<\/div>[\s\S]*?<img src="([\s\S]*?)"[\s\S]*?<a class="name" href="([\s\S]*?)">([\s\S]*?)<\/a>/g;
    var match = re.exec(blob), first = true;
    while (match) {
        var status = match[2].match(/<span>([\s\S]*?)<\/span>/); 
        if (status) 
            status = 'Eps ' + status[1];
        else 
            status = match[2].replace(/quality">/, '');
        page.appendItem(plugin.id + ':indexItem:' + escape(match[4]) + ':' + escape(match[5]), 'video', {
            title: new showtime.RichText(coloredStr(status, orange) + ' ' + match[5]),
            icon: showtime.entityDecode(match[3])
        });
        page.entries++;                   
        match = re.exec(blob);
    }        
}

function loadFromURL(page, url) {
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
        if (!doc.match(/<div class="item"/)) return tryToSearch = false;
	page.loading = false;
        scraper(page, doc);
        fromPage++;
	return true;
    };
    loader();
    page.paginator = loader;
}

new page.Route(plugin.id + ":loadFromURL:(.*):(.*)", function(page, url, title) {
    setPageHeader(page, unescape(title));
    loadFromURL(page, unescape(url) + '?page=');
});

new page.Route(plugin.id + ":search:(.*)", function(page, query) {
    setPageHeader(page, plugin.synopsis + ' / ' + query);
    loadFromURL(page, service.baseURL + '/search?keyword=' + query.replace(/\s/g, '\+') + '&page=');
});

page.Searcher(plugin.id, logo, function(page, query) {
    loadFromURL(page, service.baseURL + '/search?keyword=' + query.replace(/\s/g, '\+') + '&page=');
});
