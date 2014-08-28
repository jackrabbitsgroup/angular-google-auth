/**
@todo
- contacts: handle paging (& querying) instead of returning ALL (currently 3000 max)
- once google fixes it's api, just use google plus people api to get current user's email..

@fileOverview
Handles google login

@usage
1. call init with google client id (required) and scope/permissions (optional) to initialize (only needs to be called once)
2. call login with a callback event that will be $broadcast with the google credentials for the user who logged in

	//initialize google auth with client id
	jrgGoogleAuth.init({'client_id':LGlobals.info.googleClientId, 'scope':'https://www.googleapis.com/auth/plus.login https://www.googleapis.com/auth/userinfo.email'});

	//do actual login
	var evtGoogleLogin ="evtGoogleLogin";
	$scope.googleLogin =function() {
		jrgGoogleAuth.login({'extraInfo':{'user_id':true, 'emails':true}, 'callback':{'evtName':evtGoogleLogin, 'args':[]} });
	};
	
	// @param {Object} googleInfo
		// @param {Object} token Fields directly returned from google, with the most important being access_token (but there are others not documented here - see google's documentation for full list)
			// @param {String} access_token
		// @param {Object} [extraInfo]
			// @param {String} [user_id]
			// @param {Array} [emails] Object for each email
				// @param {String} value The email address itself
				// @param {String?} type ?
				// @param {Boolean} primary True if this is the user's primary email address
			// @param {String} [emailPrimary] User's primary email address (convenience field extracted from emails array, if exists)
	$scope.$on(evtGoogleLogin, function(evt, googleInfo) {
		//do stuff here
	});
	

@toc
//public
0. init
0.25. setGoogleOpts
0.5. destroy
1. login
2. getContacts
//private
1.5. loginCallback
3. pullPrimary

*/

'use strict';

angular.module('jackrabbitsgroup.angular-google-auth', [])
.factory('jrgGoogleAuth', ['$rootScope', '$http', '$q', function ($rootScope, $http, $q) {

	//public methods & properties
	var self ={
		/**
		@toc 0.
		@method init
		@param {Object} params
			@param {String} client_id Google client id (required for login to work)
			@param {String} [scope] Space delimited string of permissions to request, i.e. "https://www.googleapis.com/auth/plus.login https://www.googleapis.com/auth/userinfo.email https://www.google.com/m8/feeds/". Defaults to "https://www.googleapis.com/auth/plus.login" otherwise
		*/
		init: function(params)
		{
			this.setGoogleOpts(params);
		},
		
		/**
		Used to set google client id as well as request permissions (scope)
		@toc 0.25.
		@method setGoogleOpts
		@param {Object} params
			@param {String} client_id Google client id (required for login to work)
			@param {String} [scope] Space delimited string of permissions to request, i.e. "https://www.googleapis.com/auth/plus.login https://www.googleapis.com/auth/userinfo.email https://www.google.com/m8/feeds/". Defaults to "https://www.googleapis.com/auth/plus.login" otherwise
			@param {Array} [scopeHelp =[]] Shorthand names for scope privileges so you don't need to know the full url (they'll be mapped for you here). If BOTH scope and scopeHelp are passed in, they'll be joined (but duplicates won't be checked for so don't pass in duplicates!). Available keys are: 'login', 'email', 'contacts'
		*/
		setGoogleOpts: function(params) {
			//extend google info (client id, scope)
			var ii;
			//set client id
			if(params.client_id) {
				googleInfo.client_id =params.client_id;
			}
			
			//set scope (appending scope and scopeHelp map together, IF one or both are passed in)
			var scope ='';
			if(params.scope) {
				scope =params.scope;
			}
			else if(!params.scopeHelp) {		//set to default scope if NEITHER scope nor scopeHelp are set
				scope =googleInfo.scope;
			}
			if(params.scopeHelp) {
				scope +=' ';		//ensure space at end of existing list
				for(ii=0; ii<params.scopeHelp.length; ii++) {
					if(scopeMap[params.scopeHelp[ii]]) {
						scope+=scopeMap[params.scopeHelp[ii]]+' ';
					}
				}
			}
			googleInfo.scope =scope;
		},
		
		/**
		@toc 0.5.
		@method destroy
		*/
		destroy: function(params)
		{
			googleInfo = {
				'client_id':false,
				'scope': 'https://www.googleapis.com/auth/plus.login'
			};
			token ={};
			inited =false;
		},
		
		/**
		@toc 1.
		@method login
		@param {Object} params
			@param {Object} extraInfo List of additional info to get from google such as user id (which oddly isn't returned from google authentication)
				@param {Boolean} user_id true to return user id as 'user_id' field
				@param {Boolean} emails true to return emails as 'emails' field - NOTE: this requires https://www.googleapis.com/auth/userinfo.email scope to be set on init. NOTE: this currently does NOT seem to work - emails field isn't coming back from Google no matter what (tried making my email publicly visible, tried in Google oAuth playground - always blank..)
			@param {Object} callback
				@param {String} evtName
				@param {Array} args
		*/
		login: function(params) {
			var self1 =this;
			var config ={
				'scope':googleInfo.scope,
				'client_id':googleInfo.client_id
				//'immediate': true,
			};
			
			gapi.auth.authorize(config, function() {
				var googleToken =gapi.auth.getToken();
				token =googleToken;		//save for later use
				params.returnVals ={'token':googleToken};		//values to pass back via callback in loginCallback function
				if(params.extraInfo !==undefined && params.extraInfo.user_id || params.extraInfo.emails) {
					//get google user id since it's not returned with authentication for some reason..
					$http.defaults.headers.common["X-Requested-With"] = undefined;		//for CORS to work
					var url ='https://www.googleapis.com/plus/v1/people/me' +'?access_token=' + encodeURIComponent(googleToken.access_token);
					$http.get(url)
					.success(function(data) {
						params.returnVals.rawData =data;		//pass back ALL google data too
						//email doesn't seem to be returned..?? even with scope set to access it.. oauth2 playground not evening returning it, even after I changed my email to be publicly visible...
						params.returnVals.extraInfo ={'user_id':data.id};
						if(params.extraInfo.emails) {
							params.returnVals.extraInfo.emails =false;		//default
							if(data.emails !==undefined) {
								params.returnVals.extraInfo.emails =data.emails;
								loginCallback(params);
							}
							else {		//use contacts to get email, lol..
								var promise =self1.getContacts({'emailOnly':true});
								promise.then(function(data) {
									//put email in people api format for consistent return
									params.returnVals.extraInfo.emails =[
										{
											value: data.email,
											type: '',
											primary: true
										}
									];
									loginCallback(params);
								}, function(data) {
									loginCallback(params);
								});
							}
						}
						else {
							loginCallback(params);
						}
					})
					.error(function(data) {
						console.log('error retrieving Google info');
						loginCallback(params);
					});
				}
				else {
					loginCallback(params);
				}
				
				//get back in angular world (since did Google calls, etc. - without this, nothing will happen!)
				if(!$rootScope.$$phase) {
					$rootScope.$apply();
				}
			});
		},
		
		/**
		Get a user's google contacts (also used just to get the current user's email, which is NOT returned by google plus people api for some reason..)
		@toc 2.
		@method getContacts
		@param {Object} opts
			@param {Boolean} emailOnly true if only using this to get the current user's email (instead of actually getting contacts)
		@return promise with object for data on success or error. Structure depends on if it's emailOnly or not. emailOnly just returns an object with 'email' as the key.
			@param {Array} contacts For each contact, an object of:
				@param {String} name
				@param {String} email
				@param {String} phone
				//@param {String} image
		*/
		getContacts: function(opts) {
			if(!opts) {
				opts ={};
			}
			var deferred = $q.defer();
			var googleToken =token;
			//set max results		//@todo - handle paging (& querying) instead of returning ALL
			var maxResults =3000;		//set arbitrarily large
			if(opts.emailOnly) {		//don't care about contacts, just want current user's email
				maxResults =1;
			}
			$http.defaults.headers.common["X-Requested-With"] = undefined;		//for CORS to work
			//NOTE: this isn't well documented, but can use "alt=json" to return json instead of xml
			var url ='https://www.google.com/m8/feeds/contacts/default/full' +'?access_token=' + encodeURIComponent(googleToken.access_token) +'&alt=json&max-results='+maxResults;
			$http.get(url)
			.success(function(data) {
				if(opts.emailOnly) {
					deferred.resolve({'email':data.feed.id.$t});
				}
				else {
					/*
					return data structure:
					feed {Object}
						entry {Array} of each contact; each is an object with fields:
							gd$email {Array} of email addresses; each is an object of:
								address {String} the email address
								primary {String} of 'true' if the primary email address
								rel ?
							gd$phoneNumber {Array} of phone numbers; each is an object of:
								$t {String} the number
								rel ?
							link {Array} of link objects, including pictures. Each item is an object of: - UPDATE - images aren't showing up - may be behind authorization but not working from the app either.. so maybe these aren't profile images??
								href {String}
								type {String} 'image/*' for images
								rel ?
							title {Object} of user name
								$t {String} the actual name
					*/
					var ii, vals, tempVal;
					/**
					@property contacts Array of objects, one object of info for each contact
					@type Array of objects, each has fields:
						@param {String} name
						@param {String} email
						@param {String} phone
						//@param {String} image	- these may not be images? the links aren't working..
					*/
					var contacts =[];
					for(ii =0; ii<data.feed.entry.length; ii++) {
						//reset / set default vals for this contact
						vals ={
							'email':false,
							'name':false,
							'phone':false
							//'image':false
						};
						//get email
						if(data.feed.entry[ii].gd$email) {
							tempVal =pullPrimary(data.feed.entry[ii].gd$email, {'valueKey':'address'});
							if(tempVal) {
								vals.email =tempVal;
							}
						}
						//get phone
						if(data.feed.entry[ii].gd$phoneNumber) {
							tempVal =pullPrimary(data.feed.entry[ii].gd$phoneNumber, {'valueKey':'$t'});
							if(tempVal) {
								vals.phone =tempVal;
							}
						}
						//get name
						if(data.feed.entry[ii].title) {
							vals.name =data.feed.entry[ii].title.$t;
						}
						/*
						//get image
						if(data.feed.entry[ii].link) {
							tempVal =pullPrimary(data.feed.entry[ii].link, {'valueKey':'href', 'matchKey':'type', 'matchVal':'image/*'});
							if(tempVal) {
								vals.image =tempVal;
							}
						}
						*/
						contacts[ii] =vals;
					}
					deferred.resolve({'contacts':contacts});
				}
			})
			.error(function(data) {
				var msg ='error retrieving Google contacts';
				console.log(msg);
				deferred.reject({'msg':msg});
			});
			
			return deferred.promise;
		}
	
	};
	
	//private methods and properties - should ONLY expose methods and properties publicly (via the 'return' object) that are supposed to be used; everything else (helper methods that aren't supposed to be called externally) should be private.
	var inited =false;
	var token ={};		//will store token for future use / retrieval
	var googleInfo ={
		'client_id':false,
		'scope': 'https://www.googleapis.com/auth/plus.login'
	};
	/**
	@property scopeMap Maps shorthand keys to the appropriate google url for that privilege
	@type Object
	*/
	var scopeMap ={
		'login': 'https://www.googleapis.com/auth/plus.login',
		'email': 'https://www.googleapis.com/auth/userinfo.email',
		// 'email': 'https://www.googleapis.com/auth/userinfo.email https://www.google.com/m8/feeds',		//NOTE: this currently does NOT seem to work BUT contacts api DOES return email.. lol.. so use that instead?! It requires an extra http request so is a bit slower, but at least it works..
		'contacts': 'https://www.google.com/m8/feeds'
	};
	
	/**
	@toc 1.5.
	@param {Object} params
		@param {Object} returnVals values to send back via callback (passed through as is)
		@param {Object} callback
			@param {String} evtName
			@param {Array} args
	@return {Object} returned via $rootScope.$broadcast event (pubSub)
		@param {Object} token Fields directly returned from google, with the most important being access_token (but there are others not documented here - see google's documentation for full list)
			@param {String} access_token
		@param {Object} [extraInfo]
			@param {String} [user_id]
			@param {Array} [emails] Object for each email
				@param {String} value The email address itself
				@param {String?} type ?
				@param {Boolean} primary True if this is the user's primary email address
			@param {String} [emailPrimary] User's primary email address (convenience field extracted from emails array, if exists)
		@param {Object} [rawData] The data returned directly from Google (the user profile call)
	*/
	function loginCallback(params) {
		var ii;
		//if have emails field, pull out the primary email field and return it as it's own key (for convenience)
		if(params.returnVals.extraInfo.emails && params.returnVals.extraInfo.emails.length >0) {
			var retVal =pullPrimary(params.returnVals.extraInfo.emails, {'valueKey':'value'});
			if(retVal) {
				params.returnVals.extraInfo.emailPrimary =retVal;
			}
			/*
			for(ii =0; ii<params.returnVals.extraInfo.emails.length; ii++) {
				if(params.returnVals.extraInfo.emails[ii].primary) {
					params.returnVals.extraInfo.emailPrimary =params.returnVals.extraInfo.emails[ii].value;
					break;
				}
			}
			*/
		}
		
		if(params.callback.args && params.callback.args !==undefined)
		{
			if(params.callback.args.length ===undefined)
				params.callback.args =[params.callback.args];
		}
		else {
			params.callback.args =[];
		}
		var args =params.callback.args.concat([params.returnVals]);
		if(args.length ==1) {
			args =args[0];
		}

		$rootScope.$broadcast(params.callback.evtName, args);
		if(!$rootScope.$$phase) {		//if not already in apply / in Angular world
			$rootScope.$apply();
		}
	}
	
	/**
	Helper function to find the "primary" item in an array of objects (i.e. get primary email
	@toc 3.
	@method pullPrimary
	@param {Array} items The items to iterate through and find the primary one. This should be an array of objects that has a "primary" boolean field
	@param {Object} [opts]
		@param {String} [valueKey ='value'] Which key in the object to extract for the primary item
		@param {String} [matchKey] Used in place of primary field default match; if set, then the check will be NOT on a "primary" field but on this field matching the 'matchVal' value
		@param {String} [matchVal] Paired with 'matchKey' for which array item to use (instead of matching on a boolean 'primary' field)
	@return {Mixed} value of primary item
	*/
	function pullPrimary(items, opts) {
		var ii;
		var valueKey ='value';		//default
		var retVal =false;
		if(opts.valueKey) {
			valueKey =opts.valueKey;
		}
		var found =false;
		for(ii =0; ii<items.length; ii++) {
			if(opts.matchKey !==undefined && opts.matchVal !==undefined) {
				if(items[ii][opts.matchKey] !==undefined && items[ii][opts.matchKey] ==opts.matchVal) {
					retVal =items[ii][valueKey];
					found =true;
					break;
				}
			}
			else {
				if(items[ii].primary || items[ii].primary =='true') {
					retVal =items[ii][valueKey];
					found =true;
					break;
				}
			}
		}
		//if not found, just use the first item
		if(!found && items.length >0) {
			retVal =items[0][valueKey];
		}
		return retVal;
	}
	
	return self;
}]);