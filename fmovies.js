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
var logo = Plugin.path + "logo.png";
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

settings.globalSettings('settings', plugin.title, logo, plugin.synopsis);
settings.createString('baseUrl', "Base URL without '/' at the end", 'https://fmovies.to', function(v) {
    service.baseUrl = v;
});

new page.Route(plugin.id + ":indexItem:(.*):(.*)", function(page, url, title) {
    setPageHeader(page, plugin.synopsis + ' / ' + unescape(title));
    var item = http.request(service.baseUrl + unescape(url), {
         headers: {
             referer: service.baseUrl,
             'user-agent': UA
         }
    }).toString();

return;
    page.loading = true;
    page.entries = 0;
    var tryToSearch = true;
    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
        var doc = http.request(service.baseUrl + url).toString();
	page.loading = false;
        scraper(page, doc);
        var more = doc.match(/nbsp;<a href="([\s\S]*?)"><b>След.&nbsp/);
	if (!more) return tryToSearch = false;
        url = more[1];
        return true;
    };
    loader();
    page.paginator = loader;
});

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

new page.Route(plugin.id + ":play:(.*):(.*)", function(page, url, title) {
    page.loading = true;
    page.type = 'video';

    var doc = http.request(service.baseUrl + unescape(url), {
         headers: {
             referer: service.baseUrl,
             'user-agent': UA
         }
    }).toString();
    var ts = doc.match(/data-ts="([\s\S]*?)">/)[1];
    var srvRow = doc.match(/<div class="server[\s\S]*?data-id="([\s\S]*?)">[\s\S]*?data-id="([\s\S]*?)" href="([\s\S]*?)">/);
    var server = srvRow[1];
    var id = srvRow[2];
    var referer = srvRow[3];
    var o = {'ts': ts, 'id': id, 'server': server};

    var hash = "iQDWcsGqN";
    var s = r(hash);
    for (n in o)  
        s += r(a(hash + n, o[n]));
    showtime.print(showtime.JSONEncode(o) + ' _= ' + s);
    doc = http.request(service.baseUrl + '/ajax/episode/info?ts=' + ts + '&_=' + s + '&id=' + id + '&server=' + server, {
         headers: {
             referer: service.baseUrl + referer,
             'user-agent': UA,
             'x-requested-with': 'XMLHttpRequest'
         }
    }).toString();

    var target = showtime.JSONDecode(doc).target + '&autostart=true';
    showtime.print(target);
    doc = http.request(target, {
         headers: {
             referer: service.baseUrl + referer,
             'user-agent': UA
         }
    }).toString();
    showtime.print(doc);
    var lnk = doc.match(/"file":"([\s\S]*?)"/)[1];
    var host = lnk.replace('http://','').replace('https://','').split(/[/?#]/)[0];

    io.httpInspectorCreate('.*' + host.replace(/\./g, '\\.') + '.*', function(req) {
        req.setHeader('Host', req.url.replace('http://','').replace('https://','').split(/[/?#]/)[0]);
        req.setHeader('Origin', 'https://mcloud.to');
        req.setHeader('Referer', target);
        req.setHeader('User-Agent', UA);
    });

       page.source = "videoparams:" + showtime.JSONEncode({
            title: unescape(title),
            sources: [{
                url: 'hls:' + lnk
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
    }
}

new page.Route(plugin.id + ":start", function(page) {
    setPageHeader(page, plugin.synopsis);
    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Search in ' + service.baseUrl
    });
    doc = http.request(service.baseUrl, {
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
        page.appendItem(plugin.id + ':play:' + escape(match[4]) + ':' + escape(match[5]), 'video', {
            title: new showtime.RichText(coloredStr(status, orange) + ' ' + match[5]),
            icon: showtime.entityDecode(match[3])
        });
        page.entries++;                   
        match = re.exec(blob);
    }        
}

function search(page, query) {
    page.entries = 0;
    var fromPage = 0, tryToSearch = true;

    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
	var doc = http.request(service.baseUrl + '/search?keyword=' + query.replace(/\s/g, '\+') + '&page=' + fromPage).toString();
	page.loading = false;
        scraper(page, doc);
	if (!doc.match(/<div class="item"/)) return tryToSearch = false;
        fromPage++;
	return true;
    };
    loader();
    page.paginator = loader;
}

new page.Route(plugin.id + ":search:(.*)", function(page, query) {
    setPageHeader(page, plugin.synopsis + ' / ' + query);
    search(page, query);
});

page.Searcher(plugin.id, logo, function(page, query) {
    search(page, query);
});
