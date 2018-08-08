(function (window, document) {
  const Rx = window.rxjs; // rxjs
  const R = window.R; // ramda
  const { operators } = Rx;
  const { ajax } = Rx.ajax;


  // Store Setup
  // ---------------------------------------------------------------------------

  /**
   * combineEpics :: (...(action$, state$, { Dependencies })) -> action$
   * Takes many epic functions and returns single epic function that
   * shares incoming actions with each.
   */
  function combineEpics (...epics) {
    return (action$, state$, deps) => Rx.from(epics)
      .pipe(
        operators.flatMap(epic => epic(action$, state$, deps))
      );
  }

  /**
   * combineReducers :: ({ String: ({ State }, { Action }) -> { State }}) -> ({ State }, { Action }) -> { State }
   * Takes many reducers and applies them to sub-state specified by key and
   * returns single reducer function
   */
  function combineReducers (reducers) {
    return (state, action) => {
      return R
        .toPairs(reducers)
        .reduce(
          (state, [ key, reducer ]) => {
            const current = state[key];
            const next = reducer(current, action);

            return current === next ? state : R.assoc(key, next, state);
          },
          state
        );
    };
  }

  /**
   * createReducer :: { [String]: ({ State }, { Action }) -> { State }}
   * Creates a reducer that reduces its piece of the store according to
   * action string type.
   * Returns function that takes current parent state and action object to
   * reduce with.
   */
  function createReducer (handlers) {
    return (state=handlers.initial, action) => {
      if (handlers[action.type]) {
        return handlers[action.type](state, action);
      }

      return state;
    };
  }

  /**
   * delayAtLeast :: Number -> Observabe -> Observable
   * Waits for slowest race between a timer of delay in milliseconds or source
   * observable. Often used to butter up the UX so UI doesn't flash.
   */
  function delayAtLeast (delay) {
    return stream => Rx
      .combineLatest(stream, Rx.timer(delay))
      .pipe(operators.map(R.head));
  }

  /**
   * createAction :: String -> a -> { type: String, data: a}
   * Curried helper function to create action objects. Syntax sugar mostly.
   * @example
   * [ 55 ].map(createAction("ADD"))
   * // => { type: "ADD", data: 55 }
   */
  const createAction = R.curry(function createAction (type, data) {
    return { type, data };
  });

  /**
   * ofType :: (String | [ String ]) -> { Action } -> Boolean
   * Takes a string or list of strings and returns a function that takes
   * an action. If the action type is in the list of expected types return
   * true otherwise false.
   */
  function ofType (types) {
    return action => []
      // coerce into an array
      .concat(types)
      // return true if action's type is in expected types list
      .includes(action.type);
  }

  // Store
  // ---------------------------------------------------------------------------
  const actions = {
    INITIALIZE: "signup/initialize",
    REQUEST_SIGNUP: "signup/request",
    SIGNUP_ERRORS: "signup/errors",
    SIGNUP_SUCCESS: "signup/success",
    SUBMIT: "signup/form/submit",
    UPDATE_FORM: "signup/form/update",
  };

  const deps = {
    window,
  };

  // Create store reducers that respond to various action types
  const reducer = combineReducers({
    is_loading: createReducer({
      initial: false,
      [actions.REQUEST_SIGNUP]: R.T,
      [actions.SIGNUP_SUCCESS]: R.F,
      [actions.SIGNUP_ERRORS]: R.F,
    }),
    errors: createReducer({
      initial: [],
      [actions.REQUEST_SIGNUP]: () => [],
      [actions.SIGNUP_SUCCESS]: () => [],
      [actions.SIGNUP_ERRORS]: (state, action) =>
        R.uniq(state.concat(action.data)),
    }),
    form: createReducer({
      initial: {
        first_name: "",
        last_name: "",
        email: "",
      },
      [actions.UPDATE_FORM]: (state, action) =>
        R.mergeDeepRight(state, action.data),
    }),
    user: createReducer({
      initial: {},
      [actions.SIGNUP_SUCCESS]: (state, action) =>
        R.mergeDeepRight(state, action.data),
    }),
    view: createReducer({
      initial: "form",
      [actions.SIGNUP_SUCCESS]: () => "confirm",
    }),
    location: createReducer({
      initial: {},
      [actions.INITIALIZE]: (state, action) => ({
        protocol: action.data.location.protocol,
        host: action.data.location.host,
      })
    }),
  })

  /**
   * submitEpic ::  (Observable action$, Observable state$)
   *   -> Observable action$
   * Epic for form submissions. Ensures we are not in the process of loading
   * a request already and waits 200ms from the last submission before
   * emitting a REQUEST_SIGNUP action.
   */
  function submitEpic (action$, state$) {
    return action$
      .pipe(
        // Received SUBMIT action
        operators.filter(ofType(actions.SUBMIT)),
        // Get latest state, kill previously awaiting streams
        operators.switchMap(() => state$.pipe(operators.take(1))),
        // Only continue if we're not loading
        operators.filter(state => !state.is_loading),
        // Only take the last state update in 200ms
        operators.debounceTime(200),
        // { form: { Form } } -> { Form }
        operators.pluck("form"),
        // Only continue if Form data is different than last time
        // prevents spamming the submit button when data is incorrect
        operators.distinctUntilChanged(R.equals),
        // { Form } -> { type: REQUEST_SIGNUP, data: { Form }}
        operators.map(createAction(actions.REQUEST_SIGNUP)),
      );
  }

  /**
   * requestInviteEpic :: (Observable action$, Observable state$)
   *   -> Observable action$
   * Request invite form server and either show errors to user or continue to
   * confirmation page
   */
  function requestInviteEpic (action$, state$) {
    return action$
      .pipe(
        // REQUEST_SIGNUP action received
        operators.filter(ofType(actions.REQUEST_SIGNUP)),
        // { data: {} } -> {}
        operators.pluck("data"),
        // { data } -> Observable
        operators.switchMap(data => ajax
            // request invite from server
            .post("/signup", data, {
              "Content-Type": "application/json",
            })
            .pipe(
              // when successful emit success action
              operators.map(createAction(actions.SIGNUP_SUCCESS)),
              // when failed emit fail action
              operators.catchError(err => Rx.of(
                createAction(actions.SIGNUP_ERRORS, err.response.errors)
              )),
              // wait at least 1200 ms or request if longer
              delayAtLeast(1200),
            )
        )
      );
  }

  const epic = combineEpics(
    submitEpic,
    requestInviteEpic,
  );

  // Store init
  // ---------------------------------------------------------------------------

  // Implements a light-weight redux implementation in RxJS
  const action$ = new Rx.Subject();
  const state$ = action$
    .pipe(
      operators.scan(reducer, {}),
      operators.publishReplay(1),
      operators.refCount(),
    );

  // Lightweight redux-observable implementation
  const epic$ = epic(action$, state$, deps)
    .subscribe(action => action$.next(action));

  /**
   * dispatch :: { type: string, data: a } => { Action } -> { Action }
   * Takes an action and runs it through our store reducers to calculate the
   * next store state then runs action through epics for side effects
   */
  function dispatch (action) {
    action$.next(action);

    return action;
  }

  // Create a public store shape
  const store = {
    dispatch,
    state$,
  };

  // View
  // ---------------------------------------------------------------------------

  /**
   * h :: (String, { String: * }, [ DOMElement]) -> DOMElement
   * Quick helper function to create dom elements with attributes and children
   */
  function h (element, attrs, children=[]) {
    const el = document.createElement(element);

    // set attributes on element
    R.toPairs(attrs)
      .forEach(([ key, value]) => {
        // if value is a function set it manually as it's likely an event
        // handler
        if (typeof value === "function") {
          el[key] = value;
        }
        else {
          el.setAttribute(key, value);
        }
      });

    // append children
    [].concat(children).forEach(child => {
      // if child is text node create a text node
      if (typeof child === "string") {
        el.appendChild(document.createTextNode(child));
      }
      // otherwise assume dom element
      else {
        el.appendChild(child);
      }
    });

    return el;
  }

  /**
   * url :: ({ Window.Location , String) -> String}
   * Takes location data and a path and returns a fully-qualified URL string.
   * Useful when using the h function to set src attributes.
   */
  function url (location, path) {
    return `${location.protocol}//${location.host}${path}`;
  }

  // App
  // ---------------------------------------------------------------------------
  const isView = R.propEq("view");
  const el = document.querySelector(".app");

  // General app stream responsible for rendering the form or confirm view
  const app = state$
    .pipe(
      operators.distinctUntilKeyChanged("view"),
      operators.map(R.cond([
        [ isView("confirm"), renderConfirm ],
        [ isView("form"), renderForm ],
      ])),
      operators.startWith(null),
      operators.pairwise(),
    )
    .subscribe(([ prev, next ]) => {
      if (prev) {
        el.replaceChild(next, prev);
      }
      else {
        el.replaceChild(next, el.firstChild);
      }
    })

  // Errors stream gets errors from store stream and replaces them in DOM
  const errors$ = state$
    .pipe(
      operators.filter(isView("form")),
      operators.distinctUntilKeyChanged("errors"),
      operators.map(renderFormErrors),
    )
    .subscribe(errorsView => {
      const el = document.querySelector(".form__errors");

      el.replaceChild(errorsView, el.firstChild);
    });

  // Loading stream gets loading state updates from store and disables
  // submit button
  const loading$ = state$
    .pipe(
      operators.filter(isView("form")),
      operators.distinctUntilKeyChanged("is_loading"),
      operators.map(R.prop("is_loading")),
      operators.skip(1),
    )
    .subscribe(isLoading => {
      const el = document.querySelector(".signup-form__btn");

      el.disabled = isLoading;
      el.innerHTML = isLoading ? "Requesting Invite&hellip;" : "Try Again";
    })

  /**
   * renderFormErrors :: { errors: [{ label: String, message: String}] } -> DOMElement
   * Takes our store state and returns a list of error messages.
   */
  function renderFormErrors (state) {
    return h("ul", { class: "form-errors" }, state.errors
      .map(err => h("li", { class: "form-error" }, [
        h("span", { class: "form-error__label"}, err.label),
        h("p", { class: "form-error__message"}, err.message),
      ])),
    );
  }

  /**
   * renderForm :: { State } -> DOMElement
   * Takes store state and returns a form with name and email fields.
   */
  function renderForm (state) {
    return h("form", { class: "signup-form form",
                       onsubmit }, [
      h("img", { class: "app__logo", alt: "VenueBook + Slack Community", src: url(state.location, "/img/venuebook_slack_logo.svg")}, []),
      h("p", { class: "app__intro" }, "Chat with other Venue Managers to talk shop, trade stories, and expand your network."),
      h("h1", { class: "app__title" }, "Request an Invitation"),
      h("div", { class: "form-field signup-form__first-name" }, [
        h("label", { for: "id_first_name",
                     class: "form-label" },
                   "First Name"),
        h("input", { id: "id_first_name",
                     name: "first_name",
                     class: "form-input form-input--type_text",
                     oninput,
                     type: "text" }),
      ]),
      h("div",     { class: "form-field signup-form__last-name" }, [
        h("label", { for: "id_last_name",
                     class: "form-label" },
                   "Last Name"),
        h("input", { id: "id_last_name",
                     name: "last_name",
                     class: "form-input form-input--type_text",
                     oninput,
                     type: "text" }),
      ]),
      h("div",     { class: "form-field signup-form__email" }, [
        h("label", { for: "id_email",
                     class: "form-label" },
                   "Email"),
        h("input", { id: "id_email",
                     name: "email",
                     class: "form-input form-input--type_text",
                     oninput,
                     type: "text" }),
      ]),
      h("div",     { class: "form__errors" }, [
        renderFormErrors(state),
      ]),
      h("div",     { class: "form-field signup-form__submit" }, [
        h("button", { type: "submit",
                      name: "email",
                      class: "signup-form__btn" },
                    "Join the Conversation"),
      ])
    ]);
  }

  /**
   * renderConfirm :: { State } -> DOMElement
   * Takes store state and returns confirm page
   */
  function renderConfirm (state) {
    return h("div", { class: "signup-confirm signup-form" }, [
      h("h1", {}, "Invite Sent"),
      h("p", { class: "app__intro" }, [
        `Hi ${state.form.first_name}, we just sent an invitation to `,
      ]),
      h("p", { class: "app__intro" }, [
        h("code", { class: "app__code" }, state.form.email),
      ]),
      h("p", { class: "app__intro" }, "We hope to hear from you soon.")
    ])
  }

  // Event Handlers
  // -------------------------------------------------------------------------

  /**
   * onSubmit :: { SubmitEvent } -> void
   * Dispatches SUBMIT action to store reducers & epics
   */
  function onsubmit (e) {
    e.preventDefault();
    store.dispatch(createAction(
      actions.SUBMIT,
      {},
    ))
  }

  /**
   * onInput :: { InputEvent } -> void
   * Dispatches UPDATE_FORM to store reducers & epics
   */
  function oninput (e) {
    store.dispatch(createAction(
      actions.UPDATE_FORM,
      { [e.target.name]: e.target.value },
    ));
  }

  // Initialize app
  // --------------------------------------------------------------------------
  store.dispatch(createAction(actions.INITIALIZE, {
    location: window.location,
  }));

})(window, document);
