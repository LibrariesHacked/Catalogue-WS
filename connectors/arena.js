console.log('arena connector loading...');

///////////////////////////////////////////
// REQUIRES
// Request (for HTTP calls)
///////////////////////////////////////////
var request = require('request'),
    xml2js = require('xml2js'),
    cheerio = require('cheerio');

///////////////////////////////////////////
// VARIABLES
///////////////////////////////////////////
var searchUrl = 'search?p_p_state=normal&p_p_lifecycle=1&p_p_action=1&p_p_id=searchResult_WAR_arenaportlets&p_p_col_count=5&p_p_col_id=column-1&p_p_col_pos=1&p_p_mode=view&search_item_no=0&search_type=solr&search_query=organisationId_index:[ORGID] AND [ISBNAlias]_index:[ISBN]';

//////////////////////////
// Function: searchByISBN
//////////////////////////
exports.searchByISBN = function (isbn, lib, callback) {
    if (lib.ISBN == 10) isbn = isbn.substring(3);
    console.log(isbn);
    var responseHoldings = { service: lib.Name, availability: [], start: new Date() };
    var handleError = function (error) {
        if (error) {
            responseHoldings.error = error;
            responseHoldings.end = new Date();
            callback(responseHoldings);
            return true;
        }
    };

    // Request 1: Perform the search.
    request.get({ forever: true, url: lib.Url + searchUrl.replace('[ISBNAlias]', lib.ISBNAlias).replace('[ISBN]', isbn).replace('[ORGID]', lib.OrganisationId), headers: { 'Connection': 'keep-alive' }, timeout: 10000, jar: true }, function (error, message, response) {
        if (handleError(error)) return;
        // Mega Hack! Find occurence of search_item_id= and then &agency_name=, and get item ID inbetween
        
        if (response.lastIndexOf("search_item_id=") != -1) {
            var itemId = response.substring(response.lastIndexOf("search_item_id=") + 15, response.lastIndexOf("&agency_name="));
            // var url = lib.Url + 'results?p_p_state=normal&p_p_lifecycle=1&p_p_action=1&p_p_id=crDetailWicket_WAR_arenaportlets&p_p_col_count=4&p_p_col_id=column-2&p_p_col_pos=1&p_p_mode=view&facet_queries=&search_item_no=0&sort_advice=field%3DRelevance%26direction%3DDescending&search_item_id=' + itemId + '&agency_name=AUK000226&search_type=solr&search_query=organisationId_index%3AAUK000226%7C6+AND+number_index%3A' + isbn;
            var url = lib.Url + 'results?p_p_state=normal&p_p_lifecycle=1&p_p_action=1&p_p_id=crDetailWicket_WAR_arenaportlets&p_p_col_count=4&p_p_col_id=column-2&p_p_col_pos=1&p_p_mode=view&search_item_no=0&search_item_id=' + itemId + '&search_type=solr';
            // Request: Get the item page.
            request.get({ forever: true, url: url, timeout: 10000, headers: { 'Connection': 'keep-alive' }, jar: true }, function (error, message, response) {              
                var resourceId = '/crDetailWicket/?wicket:interface=:0:recordPanel:holdingsPanel::IBehaviorListener:0:';
                var headers = { 'Accept': 'text/xml', 'Wicket-Ajax': true };
                url = lib.Url + 'results?p_p_id=crDetailWicket_WAR_arenaportlets&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=' + resourceId + ' &p_p_cacheability=cacheLevelPage&p_p_col_id=column-2&p_p_col_pos=1&p_p_col_count=3';
                // Request 3: After triggering the item page, we should then be able to get the availability container XML data
                request.get({ forever: true, url: url, headers: headers, timeout: 10000, jar: true }, function (error, message, response) {
                    if (handleError(error)) return;
                    xml2js.parseString(response, function (err, res) {
                        $ = cheerio.load(res['ajax-response'].component[0]._);
                        // There's gotta be a better way of doing this
                        $('.arena-holding-container a').each(function (index1) {
                            // Details can return multiple organisation for joint services -- want to just get the right one.
                            if ($(this).text().trim() == lib.OrganisationName) {
                                headers['Wicket-FocusedElementId'] = 'id__crDetailWicket__WAR__arenaportlets____2a';
                                resourceId = '/crDetailWicket/?wicket:interface=:0:recordPanel:holdingsPanel:content:holdingsView:' + (index1 + 1) + ':holdingContainer:togglableLink::IBehaviorListener:0:';
                                url = lib.Url + 'results?p_p_id=crDetailWicket_WAR_arenaportlets&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=' + resourceId + '&p_p_cacheability=';

                                // Request 4: (Looped) Get the holdings details for that organisation. 
                                request.get({ forever: true, headers: headers, url: url, timeout: 10000, jar: true }, function (error, message, response) {
                                    xml2js.parseString(response, function (err, res) {
                                        $ = cheerio.load(res['ajax-response'].component[0]._);
                                        var libsData = $('.arena-holding-container');
                                        var noLibs = libsData.length;
                                        libsData.each(function (index2) {

                                            var libName = $(this).find('span.arena-holding-link').text();
                                            resourceId = '/crDetailWicket/?wicket:interface=:0:recordPanel:holdingsPanel:content:holdingsView:' + (index1 + 1) + ':childContainer:childView:' + index2 + ':holdingPanel:holdingContainer:togglableLink::IBehaviorListener:0:';
                                            url = lib.Url + 'results?p_p_id=crDetailWicket_WAR_arenaportlets&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=' + resourceId + '&p_p_cacheability=';
                                            // Request 5: (Looped) Get the libraries availability
                                            request.get({ forever: true, headers: headers, url: url, timeout: 10000, jar: true }, function (error, message, response) {
                                                
                                                xml2js.parseString(response, function (err, res) {
                                                    
                                                    $ = cheerio.load(res['ajax-response'].component[0]._);
                                                    var totalAvailable = $('td.arena-holding-nof-total span.arena-value').text();
                                                    var checkedOut = $('td.arena-holding-nof-checked-out span.arena-value').text();
                                                    
                                                    responseHoldings.end = new Date();
                                                    responseHoldings.availability.push({ library: libName, available: (parseInt(totalAvailable) - parseInt(checkedOut)), unavailable: parseInt(checkedOut) });
                                                    
                                                    if ((index2 + 1) == noLibs) callback(responseHoldings);    
                                                });
                                            });
                                        });
                                    });
                                });
                            }
                        });
                    });
                });
            });
        } else {
            responseHoldings.end = new Date();
            callback(responseHoldings)
        }
    });
};