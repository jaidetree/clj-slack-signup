(ns slack-signup.core-test
  (:require [clojure.test :refer :all]
            [slack-signup.core :refer :all]))

(deftest is-email?-test
  (testing "Returns true on valid email address"
    (is (= (is-email? "lady@example.com") true)))
  (testing "Returns false on invalid email address"
    (is (= (is-email? "dude.fail") false))))

(deftest is-name?-test
  (testing "Returns true on valid name"
    (is (= (is-name? "Lady") true)))
  (testing "Returns false on invalid name"
    (is (= (is-name? "D") false))))

(deftest is-valid?-test
  (testing "Returns true on valid data"
    (is (= (is-valid? {:ok true}) true)))
  (testing "Returns false on valid data"
    (is (= (is-valid? {:ok false}) false))))

(deftest validate-test
  (testing "Validate passes valid data"
    (let [data {:email "dude@example.com"
                :first_name "Dude"
                :last_name "Dudeson"}
          form (validate data)]
      (is (= (:ok form) true))
      (is (= (:errors form) []))
      (is (= (:data form) {:email "dude@example.com"
                           :first-name "Dude"
                           :last-name "Dudeson"}))))
  (testing "Validate fails invalid data"
    (let [data {:email "lady"
                :first_name "L"
                :last_name "   "}
          form (validate data)]
      (is (= (:ok form) false))
      (is (= (keys (first (:errors form))) [:name :label :message]))
      (is (= (count (:errors form))) 3)
      (is (= (:data form) {:email "lady"
                           :first_name "L"
                           :last_name "   "})))))

(deftest fork-test
  (testing "Fork applies :then fn on success"
    (is (= (fork {:ok true :data 1}
                 :ok
                 :then #(update % :data inc)
                 :else #(update % :data dec))
          {:ok true :data 2})))
  (testing "Fork applies :else fn on fail"
    (is (= (fork {:ok false :data 1}
                 :ok
                 :then #(update % :data inc)
                 :else #(update % :data dec))
          {:ok false :data 0}))))
