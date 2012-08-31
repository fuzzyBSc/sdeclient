/*global module, test, ant, document */
module("json");

/*
 * Important variants
 * long poll (autoFetch) / manual fetch
 * synchronous ajax responses (if these are possible?)
 */

asyncTest("Retrieve dynamic json data", function () {
	'use strict';
	/*global URI, weblinking, strictEqual
	*/

	$.mockjax({
		url: "/main",
		contentType: "text/json",
		responseText:  {
			foo: 0,
			bar: 0,
			baz: 0
		},
		headers: {Link: '</delta/1>; rel="delta"'}
	});

	$.mockjax({
		url: "/delta/1",
		contentType: "text/json",
		responseTime: 0,
		responseText: {
			foo: 1
		},
		headers: {Link: '</delta/2>; rel="next"'}
	});

	$.mockjax({
		url: "/delta/2",
		contentType: "text/json",
		responseTime: 0,
		responseText: {
			bar: 1
		},
		headers: {Link: '</delta/3>; rel="next"'}
	});

	$.mockjax({
		url: "/delta/3",
		contentType: "text/json",
		responseTime: 0,
		responseText: {
			baz: 1
		},
		headers: {Link: '</delta/4>; rel="next"'}
	});

	$.mockjax({
		url: "/delta/4",
		status: 202
	});

	var sde = sdeclient.create("/main", {dataType: 'json'});
	var dynamic = {};
	
	var seq = 0;

	var cb = function (data) {
		// Extend acts as a patch
		$.extend(dynamic, data);

		switch (seq++) {
		case 0:
			strictEqual(dynamic.foo, 0, "foo");
			strictEqual(dynamic.bar, 0, "bar");
			strictEqual(dynamic.baz, 0, "baz");
			break;
		case 1:
			strictEqual(dynamic.foo, 1, "foo");
			strictEqual(dynamic.bar, 0, "bar");
			strictEqual(dynamic.baz, 0, "baz");
			break;
		case 2:
			strictEqual(dynamic.foo, 1, "foo");
			strictEqual(dynamic.bar, 1, "bar");
			strictEqual(dynamic.baz, 0, "baz");
			break;
		case 3:
			strictEqual(dynamic.foo, 1, "foo");
			strictEqual(dynamic.bar, 1, "bar");
			strictEqual(dynamic.baz, 1, "baz");

			sde.stop();
			$.mockjaxClear();
			start();
			break;
		}
	};

	sde.mainDoneCallbacks.add(cb);
	sde.deltaDoneCallbacks.add(cb);
});
