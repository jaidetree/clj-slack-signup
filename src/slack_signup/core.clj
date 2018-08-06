(ns slack-signup.core
  (:require [clj-http.client :as client]
            [environ.core :refer [env]]))

(def slack-token (env :slack-token))
(def channel-id (env :channel-id))

(def email-regex
     #"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$")

(def slack-errors {:already_in_team {:name "Email"
                                     :label "Already in Team"
                                     :message "Looks like you are already a member. Try signing in or resetting your password."}
                   :already_invited {:name "Email"
                                     :label "Already Invited"
                                     :message "An invite was already sent. Please check your email for an invite."}
                   :sent_recently {:name "Email"
                                   :label "Resent Invitation"
                                   :message "We recently sent an invitation to this email address. Please check your email inbox for an invitation."}
                   :invalid_email {:name "Email"
                                   :label "Invalid email"
                                   :message "Sorry but that doesn't appear to be a valid email address. Please correct it and try again."}})

(defn is-email?
  [email]
  (boolean (and email
                (re-find email-regex (clojure.string/trim email)))))
(defn is-name?
  [name]
  (boolean (and name
                (>= (count (clojure.string/trim name)) 2))))

(defn is-valid?
  [form]
  (= (:ok form) true))

(defn validate
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
  []
  (let [data {:token slack-token}]
    (client/get "https://slack.com/api/channels.list"
                {:query-params data
                 :as :json
                 :accept :json})))

(defn send-invite
  "Takes an email, last-name, and first-name strings and returns response from
  sending slack invite.

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

; (send-invite
;   "jay@venuebook.com"
;   "Jay"
;   "Zawrotny")

; (send-invite {:email "jay+invite.test.1@venuebook.com"
;               :first-name "Jay"
;               :last-name "Zawrotny"})

(defn fork
  [input test-fn & {:keys [then else with]
                    :or {else identity with []}}]
  (if (test-fn input)
    (apply then input with)
    (apply else input with)))

(defn error-response
  [form]
  {:status 400
   :headers {"Content-Type" "application/json"}
   :body {:ok false
          :data (:data form)
          :errors (:errors form)}})

(defn success-response
  [form]
  {:status 200
   :headers {"Content-Type" "application/json"}
   :body {:ok true
          :data (:data form)
          :errors []}})

(defn request-invite
  [form]
  (let [data (:data form)
        response (send-invite data)]
    (if (is-valid? response)
        form
        {:ok false
         :data data
         :errors [(get slack-errors (keyword (:error response)))]})))

(defn request-invite-handler
  [req]
  (let [form-data (:body req)]
    (-> form-data
        (validate)
        (fork is-valid? :then request-invite)
        (fork is-valid? :then success-response :else error-response))))
