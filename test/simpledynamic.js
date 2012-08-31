/*global module, test, ant, document */
module("simpledynamic");

/*
 * Important variants
 * long poll (autoFetch) / manual fetch
 * synchronous ajax responses (if these are possible?)
 */

asyncTest("Animate the content of a div", function () {
	'use strict';
	/*global URI, weblinking, strictEqual
	*/

	$.mockjax({
		url: "/main",
		contentType: "text/html",
		responseText: "<p>Hello world</p>",
		headers: {Link: '</delta/1>; rel="delta"'}
	});

	$.mockjax({
		url: "/delta/1",
		contentType: "text/html",
		responseTime: 0,
		responseText: "<p>foo</p>",
		headers: {Link: '</delta/2>; rel="next"'}
	});

	$.mockjax({
		url: "/delta/2",
		contentType: "text/html",
		responseTime: 0,
		responseText: "<p>bar</p>",
		headers: {Link: '</delta/3>; rel="next"'}
	});

	$.mockjax({
		url: "/delta/3",
		contentType: "text/html",
		responseTime: 0,
		responseText: "<p>baz</p>",
		headers: {Link: '</delta/4>; rel="next"'}
	});

	$.mockjax({
		url: "/delta/4",
		status: 202
	});

	var sde = sdeclient.create("/main", {});

	sde.mainDoneCallbacks.add(function (data) {
		var $dynamic = $("#dynamic"); 
		$dynamic.html(data);
		equal($dynamic.html(), "<p>Hello world</p>", "Initial value");
   	});
	
	var seq = 0;

	sde.deltaDoneCallbacks.add(function (data) {
		var $dynamic = $("#dynamic"); 
		var $dynamiclast = $("#dynamic:last"); 
		$dynamiclast.append(data);

		switch (seq++) {
		case 0:
			equal($dynamic.html(), "<p>Hello world</p><p>foo</p>", "Delta 0");
			break;
		case 1:
			equal($dynamic.html(), "<p>Hello world</p><p>foo</p><p>bar</p>", "Delta 1");
			break;
		case 2:
			equal($dynamic.html(), "<p>Hello world</p><p>foo</p><p>bar</p><p>baz</p>", "Delta 2");

			sde.stop();
			$.mockjaxClear();
			start();
			break;
		}
	});
});
