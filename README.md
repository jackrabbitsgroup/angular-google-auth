# AngularJS Google login directive

Google (Plus) Login

## Demo
http://jackrabbitsgroup.github.io/angular-google-auth/

## Dependencies
- required:
	- angular (tested with 1.2.0.rc3)
	- google gapi javascript

See `bower.json` and `index.html` in the `gh-pages` branch for a full list / more details

## Install
1. download the files
	1. Bower
		1. add `"angular-google-auth": "latest"` to your `bower.json` file then run `bower install` OR run `bower install angular-google-auth`
2. include the files in your app
	1. `google-auth.min.js`
	2. google gapi javascript, i.e.:
	```
	<script type="text/javascript">
      (function() {
       var po = document.createElement('script'); po.type = 'text/javascript'; po.async = true;
       po.src = 'https://apis.google.com/js/client:plusone.js';
       var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(po, s);
     })();
    </script>
	```
3. include the module in angular (i.e. in `app.js`) - `jackrabbitsgroup.angular-google-auth`
4. include your google client id for your app (and make sure you've enabled at least the Google+ API). See here https://cloud.google.com/console

See the `gh-pages` branch, files `bower.json` and `index.html` for a full example.


## Documentation
See the `google-auth.js` file top comments for usage examples and documentation
https://github.com/jackrabbitsgroup/angular-google-auth/blob/master/google-auth.js