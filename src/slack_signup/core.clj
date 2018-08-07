(ns slack-signup.core
  (:require [clj-http.client :as client]
            [environ.core :refer [env]]))

;; Read ENV variables
(def slack-token (env :slack-token))
(def channel-id (env :channel-id))

(def email-regex
     #"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$")

;; Table to map slack server response errors to friendly messages
(def slack-errors
  {:already_in_team
     {:name "Email"
      :label "Already in Team"
      :message "Looks like you are already a member. Try signing in or resetting your password."}
   :already_invited
      {:name "Email"
       :label "Already Invited"
       :message "An invite was already sent. Please check your email for an invite."}
   :sent_recently
      {:name "Email"
       :label "Resent Invitation"
       :message "We recently sent an invitation to this email address. Please check your email inbox for an invitation."}
   :invalid_email
      {:name "Email"
       :label "Invalid email"
       :message "Sorry but that doesn't appear to be a valid email address. Please correct it and try again."}})

(def serious-error
  {:name "server_error"
   :label "Uh oh"
   :message "A serious error has occurred please report this error or try agian."})

(defn is-email?
  "Takes an email string and returns true or false if it seems like an email"
  [email]
  (boolean (and email
                (re-find email-regex (clojure.string/trim email)))))
(defn is-name?
  "Takes a string and returns true or false if it seems like a name"
  [name]
  (boolean (and name
                (>= (count (clojure.string/trim name)) 2))))
(defn is-valid?
  "Takes a form or any map and checks for {:ok true}. Returns true or false."
  [form]
  (= (:ok form) true))

(defn validate
  "Takes a map of form data and returns a parsed form object.

  Input
    {:email string
     :first_name string
     :last_name string}

  Returns
    {:ok true | false
     :errors [{:name string :label string :messsage string}]}
     :data {:email string
            :first-name string
            :last-name string}}
  "
  [form-data]
  (let [{:keys [email first_name last_name]} form-data
        errors []
        errors (if-not (is-email? email)
                 (concat errors [{:name "email"
                                  :label "Email"
                                  :message "Please provide us with a valid email address."}])
                 (concat errors []))
        errors (if-not (is-name? first_name)
                 (concat errors [{:name "first_name"
                                  :label "First Name"
                                  :message "Your first name must be at least two characters or more."}])
                 (concat errors []))
        errors (if-not (is-name? last_name)
                 (concat errors [{:name "last_name"
                                  :label "Last Name"
                                  :message "Your last name must be at least two characters or more."}])
                 (concat errors []))]
      (if (empty? errors)
        {:ok true
         :data {:email (clojure.string/trim email)
                :first-name (clojure.string/trim first_name)
                :last-name (clojure.string/trim last_name)}
         :errors []}
        {:ok false
         :data form-data
         :errors errors})))

(defn list-channels
  "Internal function. Used for listing slack channels to get IDs.
  Returns vector of channels"
  []
  (let [data {:token slack-token}]
    (-> (client/get
         "https://slack.com/api/channels.list"
         {:query-params data
          :as :json
          :accept :json})
        :body
        :channels)))

(defn send-invite
  "Takes an email, last-name, and first-name strings and returns response from
  sending slack invite.

  Input
    {:email string
     :first-name string
     :last-name string}

  Output
    {:ok true | false
     :error? string}

  API Documented:
  https://github.com/ErikKalkoken/slackApiDoc/blob/master/users.admin.invite.md"
  [{:keys [email first-name last-name]}]
  (let [data {:token slack-token
              :email email
              :first_name first-name
              :last_name last-name
              :resend true}
        params {:query-params data
                :as :json
                :accept :json}]
    (->> (client/get "https://slack.com/api/users.admin.invite" params)
         :body)))

; (send-invite {:email "jay+invite.test.1@venuebook.com"
;               :first-name "Jay"
;               :last-name "Zawrotny"})

(defn fork
  "Takes an input, predicate test-fn, :then fn, :else fn, and :with [args]
  if the input passes the predicate the :then fn is called with input and args
  otherwise the else fn is called.

  Allows us to use a single thread macro or call chain and support two
  branches.

  Input
    input - Any incoming input data
    test-fn - Predicate that takes input and returns true or false
    :with [& args] - Additional arguments as named param
    :then then-fn - Function to apply to input when test-fn returns true.
                    Takes input and any additional args
    :else else-fn - Function to call when test-fn returns false.
                    Takes input and any additional args

  Output
    Up to then-fn or else-fn, ideally same format as input

  Example
    (fork {:ok true :data 1}
          #(:ok %)
          #(update % :data inc)
          #(update % :data dec))
    // => {:ok true :data 2}
  "
  [input test-fn & {:keys [then else with]
                    :or {else identity with []}}]
  (if (test-fn input)
    (apply then input with)
    (apply else input with)))

(defn error-response
  "Takes a validated form map and returns an error JSON response.

  Input
    {:ok false
     :data {:email string :first-name string :last-name string}}
     :errors [{:name string :label string :message string}]}

  Output
    Returns a hash-map server response.
  "
  [form]
  {:status 400
   :headers {"Content-Type" "application/json"}
   :body {:ok false
          :data (:data form)
          :errors (:errors form)}})

(defn success-response
  "Takes a validated form map and returns a success JSON response

  Input
    {:ok true
     :data {:email string :first-name string :last-name string}}
     :errors []}

  Output
    Returns a hash-map server response.
  "
  [form]
  {:status 200
   :headers {"Content-Type" "application/json"}
   :body {:ok true
          :data (:data form)
          :errors []}})

(defn request-invite
  "Takes a validated form map and returns an updated form

  Input
    {:ok true | false
     :data {:email string :first-name string :last-name string}
     :errors [{:name string :label string :message string}]}

  Output
    {:ok true | false
     :data {:email string :first-name string :last-name string}
     :errors [{:name string :label string :message string}] | []}
  "
  [form]
  (let [data (:data form)
        response (send-invite data)]
    (if (is-valid? response)
        form
        {:ok false
         :data data
         :errors [(get slack-errors (keyword (:error response)) serious-error)]})))

(defn request-invite-handler
  "Ring handler takes a request map with parsed :body and returns response.

  Input
    Ring handler request map with :body map

  Output
    Ring handler response map with :body map
  "
  [req]
  (let [form-data (:body req)]
    (-> form-data
        (validate)
        (fork is-valid? :then request-invite)
        (fork is-valid? :then success-response :else error-response))))
