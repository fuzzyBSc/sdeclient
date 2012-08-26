/*global module, test, ant, document */
module("test");

asyncTest("Simple test sequence", function () {
	'use strict';
	/*global URI, weblinking, strictEqual
	*/
	expect(7);

	$.mockjax({
		url: "/main",
		contentType: "text/plain",
		responseText: "main1",
		headers: {Link: '</delta/1>; rel="delta"'}
	});

	$.mockjax({
		url: "/delta/1",
		contentType: "text/plain",
		responseText: "delta1",
		headers: {Link: '</delta/2>; rel="next"'}
	});

	$.mockjax({
		url: "/delta/2",
		status: 204
	});
	
	var sde = sdeclient.create("/main", {});
	var sequence = 0;

	sde.mainDoneCallbacks.add(function (data) {
		strictEqual(sequence, 0); ++sequence;
		strictEqual(data, "main1", "Check main fetch");
   	});

	sde.deltaDoneCallbacks.add(function (data) {
		strictEqual(sequence, 2); ++sequence;
		strictEqual(data, "delta1", "Check delta fetch");
	});

	sde.progressCallbacks.add(function (data) {
		ok(sequence in {1:1, 3:3, 4:4}, "Progress made"); ++sequence;
		if (sequence == 5) {
			sde.stop();
			start();
		}
	});
});
